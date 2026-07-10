import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Gate = { required: boolean; verified: boolean; privileged: boolean; aal: string | null };

type EnrollState = {
  factorId: string;
  qr: string;
  secret: string;
  uri: string;
};

/**
 * Phase 2 hardening: Super Admin and Admin accounts MUST have MFA (aal2)
 * for the current session. When missing, block the app shell and offer
 * self-service TOTP enrollment + challenge. Non-privileged users see nothing.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [gate, setGate] = useState<Gate | null>(null);
  const [loading, setLoading] = useState(false);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState("");
  const [hasEnrolled, setHasEnrolled] = useState<boolean | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  const refreshGate = async () => {
    const { data, error } = await supabase.rpc("mfa_gate_for_current_user");
    if (!error && data) setGate(data as unknown as Gate);
  };

  const refreshFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;
    const verified = data.totp.find((f) => f.status === "verified");
    setHasEnrolled(Boolean(verified));
    if (verified) setFactorId(verified.id);
  };

  useEffect(() => {
    if (!user) {
      setGate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      await refreshGate();
      if (cancelled) return;
      await refreshFactors();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user || !gate || !gate.required || gate.verified) return <>{children}</>;

  const startEnroll = async () => {
    setLoading(true);
    try {
      // Clean any stale unverified factor first
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `TOTP ${Date.now()}`,
      });
      if (error) throw error;
      setEnroll({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start enrollment");
    } finally {
      setLoading(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    setLoading(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) throw vErr;
      toast.success("Two-factor authentication enabled");
      setEnroll(null);
      setCode("");
      await refreshFactors();
      await refreshGate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const startChallenge = async () => {
    if (!factorId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) throw error;
      setChallengeId(data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start challenge");
    } finally {
      setLoading(false);
    }
  };

  const verifyChallenge = async () => {
    if (!factorId || !challengeId) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      toast.success("Verified");
      setCode("");
      setChallengeId(null);
      await refreshGate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3 text-amber-600">
          <ShieldAlert className="h-6 w-6" />
          <h1 className="text-xl font-bold">Two-factor authentication required</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account has an elevated role. WASSHA SACCOS security policy requires a second factor
          (TOTP authenticator) for this session.
        </p>

        {/* Case A: user has no verified TOTP → enroll */}
        {hasEnrolled === false && !enroll && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">You have not enrolled a second factor yet. Set one up now:</p>
            <Button onClick={startEnroll} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set up authenticator app
            </Button>
          </div>
        )}

        {hasEnrolled === false && enroll && (
          <div className="mt-6 space-y-4">
            <p className="text-sm">
              Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy,
              etc.), then enter the 6-digit code to confirm.
            </p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <img src={enroll.qr} alt="TOTP QR" className="h-48 w-48" />
            </div>
            <div className="text-xs text-muted-foreground">
              Can't scan? Enter this secret manually:{" "}
              <code className="font-mono">{enroll.secret}</code>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">6-digit code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEnroll(null);
                  setCode("");
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={verifyEnroll} disabled={loading || code.length !== 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify &amp; enable
              </Button>
            </div>
          </div>
        )}

        {/* Case B: user already has a factor but this session isn't aal2 → challenge */}
        {hasEnrolled === true && (
          <div className="mt-6 space-y-4">
            <p className="text-sm">
              Enter the 6-digit code from your authenticator app to unlock this session.
            </p>
            {!challengeId ? (
              <Button onClick={startChallenge} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start verification
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mfa-verify">6-digit code</Label>
                  <Input
                    id="mfa-verify"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={verifyChallenge} disabled={loading || code.length !== 6}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-between border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">Session AAL: {gate.aal ?? "unknown"}</p>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
