import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSuperAdminStats } from "@/lib/superadmin.functions";
import { StatCard } from "@/components/StatCard";
import { StatCardsSkeleton } from "@/components/status/LoadingState";
import { ErrorState, classifyError } from "@/components/status/ErrorState";
import { fmtTZS } from "@/lib/format";
import { Users, Wallet, PiggyBank, TrendingUp, ShieldAlert, Activity, ScanLine, LogIn } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/")({
  head: () => ({ meta: [{ title: "Super Admin Dashboard — WASSHA SACCOS" }, { name: "robots", content: "noindex" }] }),
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  const fetchStats = useServerFn(getSuperAdminStats);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["superadmin", "stats"],
    queryFn: () => fetchStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return <StatCardsSkeleton count={8} />;
  if (error) return <ErrorState kind={classifyError(error)} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">Live view of the WASSHA SACCOS system.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total members" value={data.totalMembers.toLocaleString()} tone="primary" />
        <StatCard icon={Wallet} label="Active loans" value={data.activeLoans.toLocaleString()} tone="success" />
        <StatCard icon={PiggyBank} label="Portfolio outstanding" value={fmtTZS(data.portfolioOutstanding)} tone="warning" />
        <StatCard icon={TrendingUp} label="Repayment rate" value={`${data.portfolioRepaymentRate.toFixed(1)}%`} tone="success" />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Security &amp; activity (last 24h)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={LogIn} label="Active sessions" value={data.activeSessions.toLocaleString()} tone="primary" />
          <StatCard icon={ShieldAlert} label="Failed logins" value={data.failedLogins24h.toLocaleString()} tone={data.failedLogins24h > 10 ? "warning" : "primary"} />
          <StatCard icon={Activity} label="Audit events" value={data.auditEvents24h.toLocaleString()} tone="primary" />
          <StatCard icon={ScanLine} label="Completed loans" value={data.completedLoans.toLocaleString()} tone="success" />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/60 p-5">
        <h3 className="font-semibold">Coming online</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Roles &amp; Permissions, Branches, Loan Policies, Security Center, Audit Center, System Settings, AI
          Configuration, Backups, and Monitoring modules land in the next rollout groups.
        </p>
      </div>
    </div>
  );
}
