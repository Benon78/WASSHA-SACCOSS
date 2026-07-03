import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSuperAdmin } from "@/integrations/supabase/require-superadmin";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";
import { fmtDate } from "@/lib/format";
import { Activity, TrendingUp, Users, AlertTriangle } from "lucide-react";

export const getMonitoringStats = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const since1h = new Date(now - 3600 * 1000).toISOString();
    const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
    const [audit1h, audit24h, tx24h, sessions] = await Promise.all([
      supabaseAdmin.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", since1h),
      supabaseAdmin.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", since24h),
      supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }).gte("created_at", since24h),
      supabaseAdmin.from("user_sessions").select("*", { count: "exact", head: true }).is("revoked_at", null).gte("last_seen", since24h),
    ]);
    const { data: recent } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, entity, created_at, actor_id")
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      auditLastHour: audit1h.count ?? 0,
      audit24h: audit24h.count ?? 0,
      tx24h: tx24h.count ?? 0,
      activeSessions: sessions.count ?? 0,
      recent: recent ?? [],
      generatedAt: new Date().toISOString(),
    };
  });

export const Route = createFileRoute("/_app/superadmin/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const fetchStats = useServerFn(getMonitoringStats);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["superadmin", "monitoring"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (isLoading) return <PageLoader label="Loading monitoring…" />;
  if (error || !data) return <ErrorState onRetry={refetch} title="Failed to load monitoring" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Monitoring</h1>
        <p className="text-sm text-muted-foreground">Live signals from the platform. Refreshes every 30 seconds.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Activity} label="Audit events (1h)" value={data.auditLastHour} />
        <Kpi icon={Activity} label="Audit events (24h)" value={data.audit24h} />
        <Kpi icon={TrendingUp} label="Transactions (24h)" value={data.tx24h} />
        <Kpi icon={Users} label="Active sessions" value={data.activeSessions} />
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-primary" /> Recent platform activity
        </h2>
        <ul className="mt-3 divide-y divide-border/40 text-sm">
          {data.recent.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">{e.action}</span>
              <span className="truncate">{e.entity}</span>
              <span className="ml-auto text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
            </li>
          ))}
          {data.recent.length === 0 && <li className="py-4 text-center text-muted-foreground">No recent activity.</li>}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
