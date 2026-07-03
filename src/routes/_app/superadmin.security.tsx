import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import {
  getSecurityOverview,
  listActiveSessions,
  terminateSession,
} from "@/lib/superadmin-security.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { ShieldAlert, LogOut, Activity, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/security")({
  head: () => ({ meta: [{ title: "Security Center — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: SecurityPage,
});

const overviewOpts = () => queryOptions({
  queryKey: ["superadmin", "security", "overview"],
  queryFn: () => getSecurityOverview(),
  staleTime: 30_000,
});
const sessionsOpts = () => queryOptions({
  queryKey: ["superadmin", "security", "sessions"],
  queryFn: () => listActiveSessions({ data: { page: 1, pageSize: 50 } }),
  staleTime: 30_000,
});

function SecurityPage() {
  const qc = useQueryClient();
  const overview = useQuery(overviewOpts());
  const sessions = useQuery(sessionsOpts());
  const term = useServerFn(terminateSession);

  const termMut = useMutation({
    mutationFn: async (vars: { sessionId: string; password: string }) => term({ data: vars }),
    onSuccess: () => {
      toast.success("Session terminated");
      qc.invalidateQueries({ queryKey: ["superadmin", "security"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (overview.isLoading || sessions.isLoading) return <PageLoader label="Loading security center…" />;
  if (overview.error || !overview.data) return <ErrorState onRetry={overview.refetch} title="Failed to load security overview" />;
  if (sessions.error || !sessions.data) return <ErrorState onRetry={sessions.refetch} title="Failed to load sessions" />;

  const o = overview.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Security center</h1>
        <p className="text-sm text-muted-foreground">
          Live view of authentication activity, sessions and suspicious IPs. All destructive actions require password re-verification and are audited.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={AlertTriangle} label="Failed logins (24h)" value={o.failedLogins24h} tone="warn" />
        <Kpi icon={AlertTriangle} label="Failed logins (7d)" value={o.failedLogins7d} />
        <Kpi icon={ShieldAlert} label="Accounts locked (7d)" value={o.lockedAccounts7d} tone={o.lockedAccounts7d > 0 ? "warn" : "ok"} />
        <Kpi icon={Activity} label="Active sessions (24h)" value={o.activeSessions24h} tone="ok" />
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4 text-primary" /> Suspicious IPs
          <Badge variant="outline" className="ml-2 text-xs">≥5 failed logins in 7d</Badge>
        </h2>
        {o.suspiciousIps.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No suspicious IPs detected.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">IP</th>
                  <th className="pr-3">Attempts</th>
                  <th className="pr-3">Last email</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {o.suspiciousIps.map((row) => (
                  <tr key={row.ip} className="border-b border-border/40">
                    <td className="py-2 pr-3 font-mono text-xs">{row.ip}</td>
                    <td className="pr-3"><Badge variant="destructive">{row.attempts}</Badge></td>
                    <td className="pr-3 text-xs text-muted-foreground">{row.lastEmail ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">{fmtDate(row.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Active sessions
          <Badge variant="outline" className="ml-auto text-xs">{sessions.data.total} total</Badge>
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">User</th>
                <th className="pr-3">Device / Browser</th>
                <th className="pr-3">IP</th>
                <th className="pr-3">Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.rows.map((s) => (
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{s.profile?.full_name ?? "Unknown"}</div>
                    {s.profile?.member_number && (
                      <div className="text-xs text-muted-foreground">#{s.profile.member_number}</div>
                    )}
                  </td>
                  <td className="pr-3 text-xs text-muted-foreground">
                    {[s.device, s.browser, s.os].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="pr-3 font-mono text-xs">{s.ip ?? "—"}</td>
                  <td className="pr-3 text-xs text-muted-foreground">{fmtDate(s.last_seen)}</td>
                  <td>
                    <ConfirmWithPassword
                      title="Terminate session"
                      description={`Force-log out this session for ${s.profile?.full_name ?? "user"}. Their tokens will be invalidated immediately.`}
                      actionLabel="Terminate"
                      destructive
                      trigger={
                        <Button size="sm" variant="outline">
                          <LogOut className="mr-1 h-3.5 w-3.5" /> Terminate
                        </Button>
                      }
                      onConfirmed={async (pw) => { await termMut.mutateAsync({ sessionId: s.id, password: pw }); }}
                    />
                  </td>
                </tr>
              ))}
              {sessions.data.rows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No active sessions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RecentList title="Recent failed logins" items={o.recentFailed} tone="warn" />
        <RecentList title="Recent successful activity" items={o.recentLogins} />
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof ShieldAlert; label: string; value: number; tone?: "ok" | "warn" }) {
  const color = tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-primary";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function RecentList({
  title, items, tone,
}: {
  title: string;
  tone?: "warn";
  items: { id: string; email: string | null; ip: string | null; event_type: string; created_at: string }[];
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No events.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/40 text-sm">
          {items.slice(0, 15).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <Badge variant={tone === "warn" ? "destructive" : "secondary"} className="text-[10px]">
                {e.event_type}
              </Badge>
              <span className="truncate">{e.email ?? "—"}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{e.ip ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
