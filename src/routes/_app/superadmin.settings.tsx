import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listSettings, updateSetting, getSettingHistory } from "@/lib/superadmin-security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Save, History, Loader2, ShieldCheck, Clock, Bell, Palette } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/settings")({
  head: () => ({ meta: [{ title: "System Settings — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

type SettingRow = Awaited<ReturnType<typeof listSettings>>[number];

const settingsOpts = () => queryOptions({
  queryKey: ["superadmin", "settings"],
  queryFn: () => listSettings(),
  staleTime: 30_000,
});

function SettingsPage() {
  const q = useQuery(settingsOpts());
  if (q.isLoading) return <PageLoader label="Loading settings…" />;
  if (q.error || !q.data) return <ErrorState onRetry={q.refetch} title="Failed to load settings" />;

  const byKey = new Map(q.data.map((s) => [s.key, s]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">System settings</h1>
        <p className="text-sm text-muted-foreground">
          Versioned platform configuration. Every save creates a new immutable version — old versions stay for audit.
        </p>
      </header>

      <Tabs defaultValue="password">
        <TabsList>
          <TabsTrigger value="password"><ShieldCheck className="mr-1 h-4 w-4" /> Password policy</TabsTrigger>
          <TabsTrigger value="session"><Clock className="mr-1 h-4 w-4" /> Session policy</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-1 h-4 w-4" /> Notification templates</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="mr-1 h-4 w-4" /> Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="password" className="mt-4">
          <PasswordPolicyEditor row={byKey.get("security.password_policy")!} />
        </TabsContent>
        <TabsContent value="session" className="mt-4">
          <SessionPolicyEditor row={byKey.get("security.session")!} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <TemplatesEditor row={byKey.get("notifications.templates")!} />
        </TabsContent>
        <TabsContent value="branding" className="mt-4">
          <BrandingEditor row={byKey.get("app.branding")!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -----------------------------------------------------------------

function useSaveSetting<T>(key: SettingRow["key"]) {
  const qc = useQueryClient();
  const upd = useServerFn(updateSetting);
  return useMutation({
    mutationFn: async ({ password, value }: { password: string; value: T }) =>
      upd({ data: { key, value, password } }),
    onSuccess: (r) => {
      toast.success(`Saved — new version v${r.version}`);
      qc.invalidateQueries({ queryKey: ["superadmin", "settings"] });
      qc.invalidateQueries({ queryKey: ["superadmin", "settings-history", key] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
}

function SettingHeader({ row }: { row: SettingRow }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Badge variant="outline" className="text-xs">v{row.version || "—"}</Badge>
      {row.updated_at && (
        <span className="text-xs text-muted-foreground">Last updated {fmtDate(row.updated_at)}</span>
      )}
      <HistoryButton settingKey={row.key} />
    </div>
  );
}

function HistoryButton({ settingKey }: { settingKey: SettingRow["key"] }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["superadmin", "settings-history", settingKey],
    queryFn: () => getSettingHistory({ data: { key: settingKey } }),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto">
          <History className="mr-1 h-4 w-4" /> History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Version history — {settingKey}</DialogTitle></DialogHeader>
        {q.isLoading ? (
          <PageLoader label="Loading…" />
        ) : (
          <ul className="space-y-2 text-sm">
            {(q.data ?? []).map((v) => (
              <li key={v.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={v.is_current ? "default" : "outline"}>v{v.version}</Badge>
                  <span className="text-xs text-muted-foreground">{fmtDate(v.created_at)}</span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(v.value, null, 2)}</pre>
              </li>
            ))}
            {(!q.data || q.data.length === 0) && !q.isLoading && (
              <li className="text-sm text-muted-foreground">No history yet.</li>
            )}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------- editors --------------------

type PasswordPolicy = {
  min_length: number; require_upper: boolean; require_lower: boolean;
  require_digit: boolean; require_symbol: boolean; reuse_prevention: number; max_age_days: number;
};

function PasswordPolicyEditor({ row }: { row: SettingRow }) {
  const [v, setV] = useState<PasswordPolicy>(row.value as PasswordPolicy);
  useEffect(() => { setV(row.value as PasswordPolicy); }, [row.value]);
  const mut = useSaveSetting<PasswordPolicy>("security.password_policy");

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <SettingHeader row={row} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Minimum length</Label>
          <Input type="number" min={8} max={64} value={v.min_length} onChange={(e) => setV({ ...v, min_length: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Reuse prevention (last N)</Label>
          <Input type="number" min={0} max={24} value={v.reuse_prevention} onChange={(e) => setV({ ...v, reuse_prevention: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Max age (days, 0 = never)</Label>
          <Input type="number" min={0} max={365} value={v.max_age_days} onChange={(e) => setV({ ...v, max_age_days: Number(e.target.value) })} />
        </div>
        <ToggleRow label="Require uppercase" checked={v.require_upper} onChange={(c) => setV({ ...v, require_upper: c })} />
        <ToggleRow label="Require lowercase" checked={v.require_lower} onChange={(c) => setV({ ...v, require_lower: c })} />
        <ToggleRow label="Require digit" checked={v.require_digit} onChange={(c) => setV({ ...v, require_digit: c })} />
        <ToggleRow label="Require symbol" checked={v.require_symbol} onChange={(c) => setV({ ...v, require_symbol: c })} />
      </div>
      <div className="mt-4">
        <SaveButton pending={mut.isPending} onConfirmed={async (pw) => { await mut.mutateAsync({ password: pw, value: v }); }} />
      </div>
    </section>
  );
}

type SessionPolicy = {
  inactivity_timeout_minutes: number; absolute_timeout_hours: number;
  mfa_required_for_admins: boolean; ip_change_reauth: boolean;
};

function SessionPolicyEditor({ row }: { row: SettingRow }) {
  const [v, setV] = useState<SessionPolicy>(row.value as SessionPolicy);
  useEffect(() => { setV(row.value as SessionPolicy); }, [row.value]);
  const mut = useSaveSetting<SessionPolicy>("security.session");
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <SettingHeader row={row} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Inactivity timeout (minutes)</Label>
          <Input type="number" min={5} max={720} value={v.inactivity_timeout_minutes} onChange={(e) => setV({ ...v, inactivity_timeout_minutes: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Absolute session lifetime (hours)</Label>
          <Input type="number" min={1} max={72} value={v.absolute_timeout_hours} onChange={(e) => setV({ ...v, absolute_timeout_hours: Number(e.target.value) })} />
        </div>
        <ToggleRow label="Require MFA for admins" checked={v.mfa_required_for_admins} onChange={(c) => setV({ ...v, mfa_required_for_admins: c })} />
        <ToggleRow label="Re-auth on IP change" checked={v.ip_change_reauth} onChange={(c) => setV({ ...v, ip_change_reauth: c })} />
      </div>
      <div className="mt-4">
        <SaveButton pending={mut.isPending} onConfirmed={async (pw) => { await mut.mutateAsync({ password: pw, value: v }); }} />
      </div>
    </section>
  );
}

function TemplatesEditor({ row }: { row: SettingRow }) {
  const [v, setV] = useState<Record<string, string>>(row.value as Record<string, string>);
  useEffect(() => { setV(row.value as Record<string, string>); }, [row.value]);
  const [newKey, setNewKey] = useState("");
  const mut = useSaveSetting<Record<string, string>>("notifications.templates");
  const entries = Object.entries(v);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <SettingHeader row={row} />
      <p className="mb-3 text-xs text-muted-foreground">
        Use <code>{"{{placeholder}}"}</code> tokens (e.g. <code>{"{{loan_number}}"}</code>). Templates are rendered server-side when notifications are sent.
      </p>
      <div className="space-y-3">
        {entries.map(([k, val]) => (
          <div key={k} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono">{k}</code>
              <Button
                variant="ghost" size="sm" className="ml-auto"
                onClick={() => { const c = { ...v }; delete c[k]; setV(c); }}
              >
                Remove
              </Button>
            </div>
            <Textarea
              className="mt-2" rows={2} value={val}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          placeholder="new_template_key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())}
        />
        <Button
          variant="outline"
          disabled={!newKey || newKey in v}
          onClick={() => { setV({ ...v, [newKey]: "" }); setNewKey(""); }}
        >
          Add template
        </Button>
      </div>
      <div className="mt-4">
        <SaveButton pending={mut.isPending} onConfirmed={async (pw) => { await mut.mutateAsync({ password: pw, value: v }); }} />
      </div>
    </section>
  );
}

type Branding = { org_name: string; support_email: string; footer_note?: string };

function BrandingEditor({ row }: { row: SettingRow }) {
  const [v, setV] = useState<Branding>(row.value as Branding);
  useEffect(() => { setV(row.value as Branding); }, [row.value]);
  const mut = useSaveSetting<Branding>("app.branding");
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <SettingHeader row={row} />
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>Organization name</Label><Input value={v.org_name} onChange={(e) => setV({ ...v, org_name: e.target.value })} /></div>
        <div><Label>Support email</Label><Input type="email" value={v.support_email} onChange={(e) => setV({ ...v, support_email: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Footer note</Label><Input value={v.footer_note ?? ""} onChange={(e) => setV({ ...v, footer_note: e.target.value })} /></div>
      </div>
      <div className="mt-4">
        <SaveButton pending={mut.isPending} onConfirmed={async (pw) => { await mut.mutateAsync({ password: pw, value: v }); }} />
      </div>
    </section>
  );
}

// -------------------- small helpers --------------------

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SaveButton({ pending, onConfirmed }: { pending: boolean; onConfirmed: (pw: string) => Promise<void> }) {
  return (
    <ConfirmWithPassword
      title="Save settings"
      description="Create a new version of this setting group. The previous version is retained for audit."
      actionLabel="Save"
      trigger={
        <Button disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
      }
      onConfirmed={onConfirmed}
    />
  );
}
