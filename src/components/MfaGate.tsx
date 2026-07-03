import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

type Gate = { required: boolean; verified: boolean; privileged: boolean; aal: string | null };

/**
 * Phase 2 hardening: Super Admin and Admin accounts MUST have MFA (aal2)
 * for the current session. When missing, block the app shell with an
 * enrollment prompt. Non-privileged users see nothing.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [gate, setGate] = useState<Gate | null>(null);

  useEffect(() => {
    if (!user) { setGate(null); return; }
    let cancelled = false;
    supabase.rpc("mfa_gate_for_current_user").then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data) setGate(data as unknown as Gate);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user || !gate || !gate.required || gate.verified) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3 text-amber-600">
          <ShieldAlert className="h-6 w-6" />
          <h1 className="text-xl font-bold">Two-factor authentication required</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account has an elevated role (Admin or Super Admin). WASSHA SACCOS security
          policy requires you to enroll a second factor (TOTP authenticator) and complete
          the challenge for this session before you can access protected pages.
        </p>
        <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-foreground">
          <li>Open your authenticator app (Google Authenticator, 1Password, Authy, etc.).</li>
          <li>Ask your Super Admin to enroll TOTP for your account.</li>
          <li>Sign in again and complete the 6-digit challenge.</li>
        </ol>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
