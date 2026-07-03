import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { logAuthEvent } from "@/lib/auth-log.functions";
import { useAuth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/safeUrl";
import { Wallet, Loader2 } from "lucide-react";


const search = z.object({ redirect: z.string().max(2048).optional() });

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);
const passwordSignInSchema = z.string().min(1, "Password required").max(128);
const passwordSignUpSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Include at least one letter and one number",
  });
const nameSchema = z.string().trim().min(2, "Enter your full name").max(120);
const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[0-9\s\-()]{7,20}$/.test(v), { message: "Enter a valid phone number" });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in or create your account — WASSHA SACCOS" },
      { name: "description", content: "Sign in to WASSHA SACCOS to manage savings, track loan approvals, download statements and get real-time notifications." },
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
  const { user, loading: authLoading, isPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Sanitize the redirect target once — safeInternalPath rejects any URL that
  // isn't a same-origin path and blocks paths that would loop back to /auth
  // or /reset-password.
  const safeRedirect = safeInternalPath(redirectTo) ?? "/dashboard";

  // If the user is already signed in (and not in the middle of a password
  // recovery), don't let them sit on /auth — send them to their destination.
  // This is what fixes "click sign in and nothing happens" after a recovery
  // link established a session: the button submits, but if the user was
  // already signed in the previous nav collapsed into another /auth visit.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (isPasswordRecovery) {
      nav({ to: "/reset-password", replace: true });
      return;
    }
    nav({ to: safeRedirect, replace: true });
  }, [authLoading, user, isPasswordRecovery, safeRedirect, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsedEmail = emailSchema.safeParse(email);
      if (!parsedEmail.success) throw new Error(parsedEmail.error.issues[0]?.message ?? "Invalid email");
      const cleanEmail = parsedEmail.data;

      if (mode === "signup") {
        const parsedName = nameSchema.safeParse(fullName);
        if (!parsedName.success) throw new Error(parsedName.error.issues[0]!.message);
        const parsedPhone = phoneSchema.safeParse(phone);
        if (!parsedPhone.success) throw new Error(parsedPhone.error.issues[0]!.message);
        const parsedPwd = passwordSignUpSchema.safeParse(password);
        if (!parsedPwd.success) throw new Error(parsedPwd.error.issues[0]!.message);

        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: parsedPwd.data,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: parsedName.data, phone: parsedPhone.data },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome!");
        nav({ to: safeRedirect, replace: true });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent. Please check your email.");
        setMode("signin");
      } else {
        const parsedPwd = passwordSignInSchema.safeParse(password);
        if (!parsedPwd.success) throw new Error(parsedPwd.error.issues[0]!.message);
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: parsedPwd.data,
        });
        if (error) throw error;
        toast.success("Signed in");
        nav({ to: safeRedirect, replace: true });
      }
    } catch (err: any) {
      toast.error(friendlyError(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your member account" : "Reset your password";
  const subtitle = mode === "signin"
    ? "Sign in to your SACCOS dashboard."
    : mode === "signup"
      ? "Join WASSHA SACCOS in under a minute."
      : "Enter your email and we'll send you a reset link.";

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

          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

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
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pwd">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input id="pwd" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          {mode !== "forgot" && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) throw result.error;
                    if (result.redirected) return;
                    toast.success("Signed in with Google");
                    nav({ to: safeRedirect, replace: true });
                  } catch (err: any) {
                    toast.error(friendlyError(err, "Google sign-in failed"));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full"
              >
                <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4 20.98 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.12A6.98 6.98 0 015.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 001 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 4 3.02 2.18 6.04l3.66 2.84C6.71 6.28 9.14 5.38 12 5.38z"/>
                </svg>
                Continue with Google
              </Button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <>
                Remembered it?{" "}
                <button onClick={() => setMode("signin")} className="font-semibold text-primary hover:underline">
                  Back to sign in
                </button>
              </>
            ) : mode === "signin" ? (
              <>
                New to WASSHA?{" "}
                <button onClick={() => setMode("signup")} className="font-semibold text-primary hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already a member?{" "}
                <button onClick={() => setMode("signin")} className="font-semibold text-primary hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
