import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { useAuth } from "@/lib/auth";
import { Loader2, ShieldCheck, Wallet } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — WASSHA SACCOS" },
      { name: "description", content: "Set a new password for your WASSHA SACCOS member account." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(128, { message: "Password is too long" })
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Include at least one letter and one number",
  });

function ResetPasswordPage() {
  const nav = useNavigate();
  const { user, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The link Supabase sends puts a hash like #type=recovery on the URL.
  const isRecoveryLink = useMemo(() => {
    if (typeof window === "undefined") return false;
    const hash = window.location.hash || "";
    return hash.includes("type=recovery");
  }, []);

  const eligible = isPasswordRecovery || isRecoveryLink;

  useEffect(() => {
    // If someone lands here without any recovery context and no session,
    // send them to sign in.
    if (!eligible && !user) {
      nav({ to: "/auth", replace: true });
    }
  }, [eligible, user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const parsed = passwordSchema.safeParse(password);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid password");
      if (password !== confirm) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      clearPasswordRecovery();
      toast.success("Password updated. You're signed in.");
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(friendlyError(err as Error, "Could not update password"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="text-sm font-bold text-secondary">WASSHA SACCOS</div>
        </div>
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs text-muted-foreground">
            Choose a strong new password. It must be at least 8 characters and include letters and
            numbers.
          </p>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          After updating, you'll be signed in and returned to your dashboard.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pwd">New password</Label>
            <Input
              id="pwd"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwd2">Confirm new password</Label>
            <Input
              id="pwd2"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
