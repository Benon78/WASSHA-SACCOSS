import { createFileRoute, Link, useNavigate, useSearch, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, Loader2 } from "lucide-react";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in or create your account — WASSHA SACCOS" },
      { name: "description", content: "Sign in to WASSHA SACCOS to manage your savings, track loan applications through every approval stage, download statements, and receive real-time notifications for deposits, approvals and repayments." },
      { property: "og:title", content: "Sign in or create your account — WASSHA SACCOS" },
      { property: "og:description", content: "Access your WASSHA SACCOS member dashboard: savings balances, loan applications, real-time approval tracking, statements and secure notifications — all in one place." },
      { property: "og:url", content: "https://wassha-saccos.lovable.app/auth" },
      { name: "twitter:title", content: "Sign in — WASSHA SACCOS" },
      { name: "twitter:description", content: "Access your WASSHA SACCOS member dashboard: savings, loans, statements and real-time notifications." },
    ],
    links: [{ rel: "canonical", href: "https://wassha-saccos.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { redirect: redirectTo } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
      nav({ to: (redirectTo as any) || "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-stretch">
      <div className="hidden flex-1 bg-[image:var(--gradient-hero)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold">WASSHA</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">SACCOS</div>
          </div>
        </Link>
        <div>
          <h2 className="text-3xl font-bold leading-tight">Banking that works for the cooperative.</h2>
          <p className="mt-3 max-w-md text-sm text-white/75">
            Track your savings, apply for loans, follow each approval stage, and get notified the moment things move.
          </p>
        </div>
        <p className="text-xs text-white/50">© WASSHA SACCOS</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="text-sm font-bold text-secondary">WASSHA SACCOS</div>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            {mode === "signin" ? "Welcome back" : "Create your member account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to your SACCOS dashboard." : "Join WASSHA SACCOS in under a minute."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255..." />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Password</Label>
              <Input id="pwd" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to WASSHA?" : "Already a member?"}{" "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-semibold text-primary hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
