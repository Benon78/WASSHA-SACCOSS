import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { Clock, AlertTriangle, Save } from "lucide-react";
import { STAGE_LABEL, STAGE_ORDER, type LoanStage } from "@/lib/loanStages";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/admin/sla")({
  head: () =>
    pageHead({
      path: "/admin/sla",
      title: "SLA tracking — Admin",
      description: "Configure stage SLAs and monitor overdue loans in the workflow.",
      noIndex: true,
    }),
  component: SlaPage,
});

function SlaPage() {
  const { hasRole, loading } = useAuth();
  const [config, setConfig] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<any[]>([]);
  const [savingStage, setSavingStage] = useState<string | null>(null);

  const load = async () => {
    const [{ data: cfg }, { data: sla }] = await Promise.all([
      supabase.from("sla_config").select("*"),
      supabase.from("loan_sla_status").select("*").order("hours_in_stage", { ascending: false }),
    ]);
    const map: Record<string, number> = {};
    (cfg ?? []).forEach((r: any) => {
      map[r.stage] = r.max_hours;
    });
    setConfig(map);
    setRows(sla ?? []);
  };

  useEffect(() => {
    if (hasRole("admin") || hasRole("manager")) load();
  }, [hasRole]);

  if (loading) return null;
  if (!hasRole("admin") && !hasRole("manager")) return <Navigate to="/dashboard" />;

  const saveStage = async (stage: string) => {
    setSavingStage(stage);
    const max_hours = Number(config[stage] || 0);
    const { error } = await supabase.from("sla_config").upsert({ stage: stage as any, max_hours });
    setSavingStage(null);
    if (error) return toast.error(friendlyError(error));
    toast.success(`SLA updated for ${STAGE_LABEL[stage as LoanStage]}`);
    load();
  };

  const overdue = rows.filter((r) => r.overdue);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Clock className="h-6 w-6 text-primary" /> SLA tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Set the maximum hours a loan may stay at each stage; overdue loans are surfaced below.
          </p>
        </div>

        <section className="rounded-2xl border border-warning/40 bg-warning/5 p-6 shadow-[var(--shadow-card)]">
          <h2 className="flex items-center gap-2 text-base font-semibold text-warning-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" /> Overdue loans ({overdue.length})
          </h2>
          {overdue.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              All open loans are within their SLA windows.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Loan</th>
                    <th className="pr-3">Stage</th>
                    <th className="pr-3">Hours in stage</th>
                    <th className="pr-3">SLA</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-mono">{r.loan_number}</td>
                      <td className="pr-3">{STAGE_LABEL[r.stage as LoanStage] ?? r.stage}</td>
                      <td className="pr-3 font-semibold text-destructive">
                        {Number(r.hours_in_stage).toFixed(1)}h
                      </td>
                      <td className="pr-3 text-muted-foreground">{r.sla_max_hours}h</td>
                      <td>
                        <Link
                          to="/loans/$loanId"
                          params={{ loanId: r.id }}
                          className="text-primary hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {hasRole("admin") && (
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">Stage SLA (hours)</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {STAGE_ORDER.filter((s) => s !== "completed").map((stage) => (
                <div key={stage} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">{STAGE_LABEL[stage]}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={config[stage] ?? ""}
                      onChange={(e) => setConfig({ ...config, [stage]: Number(e.target.value) })}
                      placeholder="hours"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveStage(stage)}
                    disabled={savingStage === stage}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
