import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { Shield, ShieldCheck, Loader2, Trash2, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/profile")({
  head: () =>
    pageHead({
      path: "/profile",
      title: "My Profile — WASSHA SACCOS",
      description:
        "Manage your member profile, contact details, notification preferences, and two-factor authentication.",
      noIndex: true,
    }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [factors, setFactors] = useState<any[]>([]);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState({
    channel_email: true,
    channel_sms: false,
    sms_phone: "",
    quiet_hours_start: "21:00",
    quiet_hours_end: "07:00",
    digest_mode: "instant" as "instant" | "hourly" | "daily",
    mute_types: [] as string[],
  });

  const NOTIF_TYPES: { value: string; label: string }[] = [
    { value: "deposit", label: "Deposits" },
    { value: "loan_update", label: "Loan updates" },
    { value: "loan_approved", label: "Loan approvals" },
    { value: "loan_rejected", label: "Loan rejections" },
    { value: "due_reminder", label: "Due reminders" },
    { value: "docs_requested", label: "Document requests" },
    { value: "system", label: "System messages" },
  ];

  const loadAll = async () => {
    if (!user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile(p);
    setName(p?.full_name ?? "");
    setPhone(p?.phone ?? "");
    const { data: f } = await supabase.auth.mfa.listFactors();
    setFactors(f?.totp ?? []);
    const { data: pr } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pr)
      setPrefs({
        channel_email: pr.channel_email,
        channel_sms: pr.channel_sms,
        sms_phone: pr.sms_phone ?? "",
        quiet_hours_start: (pr as any).quiet_hours_start?.slice(0, 5) ?? "21:00",
        quiet_hours_end: (pr as any).quiet_hours_end?.slice(0, 5) ?? "07:00",
        digest_mode: ((pr as any).digest_mode as any) ?? "instant",
        mute_types: (pr as any).mute_types ?? [],
      });
  };

  const savePrefs = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() } as any);
    if (error) toast.error(friendlyError(error));
    else toast.success("Notification preferences saved");
  };

  const toggleMute = (t: string) => {
    setPrefs((p) => ({
      ...p,
      mute_types: p.mute_types.includes(t)
        ? p.mute_types.filter((x) => x !== t)
        : [...p.mute_types, t],
    }));
  };

  useEffect(() => {
    loadAll();
  }, [user?.id]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, phone })
      .eq("user_id", user!.id);
    setBusy(false);
    if (error) toast.error(friendlyError(error));
    else toast.success("Profile updated");
  };

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator",
      });
      if (error) throw error;
      const qr = await QRCode.toDataURL(data.totp.uri, { width: 220, margin: 1 });
      setEnrolling({ id: data.id, qr, secret: data.totp.secret });
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enrolling) return;
    setBusy(true);
    try {
      const { data: chal, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: enrolling.id,
      });
      if (cErr) throw cErr;
      const { error } = await supabase.auth.mfa.verify({
        factorId: enrolling.id,
        challengeId: chal.id,
        code,
      });
      if (error) throw error;
      toast.success("Two-factor authentication enabled");
      setEnrolling(null);
      setCode("");
      await loadAll();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (id: string) => {
    if (!confirm("Disable two-factor authentication?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(friendlyError(error));
    else {
      toast.success("2FA disabled");
      loadAll();
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">My Profile</h1>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Personal information</h2>
          <p className="text-xs text-muted-foreground">
            Member #{profile?.member_number ?? "Pending — your admin will assign one"}
          </p>
          <form onSubmit={saveProfile} className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={busy}
                className="bg-[image:var(--gradient-primary)] text-primary-foreground"
              >
                Save
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4 text-primary" /> Notification channels
          </h2>
          <p className="text-xs text-muted-foreground">
            Choose how you receive deposit confirmations, loan approvals and reminders. In-app
            notifications are always enabled.
          </p>
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Email notifications</p>
                <p className="text-xs text-muted-foreground">Sent to {user?.email}</p>
              </div>
              <Switch
                checked={prefs.channel_email}
                onCheckedChange={(v) => setPrefs({ ...prefs, channel_email: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">SMS notifications</p>
                <p className="text-xs text-muted-foreground">
                  Reminders and approvals via text message
                </p>
              </div>
              <Switch
                checked={prefs.channel_sms}
                onCheckedChange={(v) => setPrefs({ ...prefs, channel_sms: v })}
              />
            </label>
            {prefs.channel_sms && (
              <div>
                <Label>SMS phone number</Label>
                <Input
                  placeholder="+255 7XX XXX XXX"
                  value={prefs.sms_phone}
                  onChange={(e) => setPrefs({ ...prefs, sms_phone: e.target.value })}
                />
              </div>
            )}

            <div className="grid gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-sm font-medium">Quiet hours</p>
                <p className="text-xs text-muted-foreground">
                  Non-urgent notifications are held until quiet hours end. Critical alerts still
                  deliver.
                </p>
              </div>
              <div>
                <Label>Start</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours_start}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_start: e.target.value })}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours_end}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_end: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">Delivery frequency</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Batch non-urgent items into a digest.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["instant", "hourly", "daily"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPrefs({ ...prefs, digest_mode: m })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${prefs.digest_mode === m ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">Mute categories</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Muted categories are dropped entirely. Critical alerts still deliver.
              </p>
              <div className="flex flex-wrap gap-2">
                {NOTIF_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleMute(t.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${prefs.mute_types.includes(t.value) ? "border-destructive bg-destructive/10 text-destructive" : "border-border/60 text-muted-foreground"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={savePrefs}
              className="bg-[image:var(--gradient-primary)] text-primary-foreground"
            >
              Save preferences
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Shield className="h-4 w-4 text-primary" /> Two-factor authentication
              </h2>
              <p className="text-xs text-muted-foreground">
                Protect your account with an authenticator app (Google Authenticator, Authy,
                1Password).
              </p>
            </div>
            {factors.some((f) => f.status === "verified") && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Enabled
              </span>
            )}
          </div>

          {factors.filter((f) => f.status === "verified").length > 0 && (
            <ul className="mt-4 divide-y divide-border/60">
              {factors
                .filter((f) => f.status === "verified")
                .map((f) => (
                  <li key={f.id} className="flex items-center justify-between py-2.5">
                    <div className="text-sm">
                      <p className="font-medium">{f.friendly_name || "Authenticator"}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(f.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => removeFactor(f.id)}
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  </li>
                ))}
            </ul>
          )}

          {!enrolling && factors.filter((f) => f.status === "verified").length === 0 && (
            <Button onClick={startEnroll} disabled={busy} className="mt-4">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable 2FA
            </Button>
          )}

          {enrolling && (
            <div className="mt-5 space-y-4 rounded-xl border border-dashed border-border bg-muted/30 p-5">
              <p className="text-sm font-medium">Step 1 — Scan this QR code</p>
              <img src={enrolling.qr} alt="2FA QR" className="rounded-lg border bg-white p-2" />
              <p className="text-xs text-muted-foreground">
                Or enter this secret manually:{" "}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
                  {enrolling.secret}
                </code>
              </p>
              <div>
                <Label>Step 2 — Enter the 6-digit code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="mt-1 max-w-[160px] tracking-[0.4em]"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={verifyEnroll}
                  disabled={busy || code.length !== 6}
                  className="bg-[image:var(--gradient-primary)] text-primary-foreground"
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & enable
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEnrolling(null);
                    setCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
