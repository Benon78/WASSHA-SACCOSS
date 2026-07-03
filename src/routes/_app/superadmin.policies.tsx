import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { listLoanPolicies, publishLoanPolicy } from "@/lib/superadmin-config.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";
import { fmtDate, fmtTZS } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Plus, History, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/policies")({
  head: () => ({ meta: [{ title: "Loan Policies — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: PoliciesPage,
});

const policiesQueryOptions = () =>
  queryOptions({
    queryKey: ["superadmin", "loan-policies"],
    queryFn: () => listLoanPolicies(),
    staleTime: 30_000,
  });

type FormShape = {
  interest_rate: string; min_savings: string; savings_multiplier: string;
  min_membership_months: string; max_term_months: string;
  emergency_rate: string; emergency_multiplier: string;
  emergency_max_amount: string; emergency_max_term_months: string;
  chapchap_rate: string; late_penalty_rate: string; processing_fee_rate: string;
  notes: string;
};

const defaults: FormShape = {
  interest_rate: "12.0", min_savings: "100000", savings_multiplier: "3",
  min_membership_months: "3", max_term_months: "36",
  emergency_rate: "18.0", emergency_multiplier: "1.5",
  emergency_max_amount: "1000000", emergency_max_term_months: "6",
  chapchap_rate: "15.0", late_penalty_rate: "2.0", processing_fee_rate: "1.0",
  notes: "",
};

function PoliciesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(policiesQueryOptions());
  const [form, setForm] = useState<FormShape>(defaults);
  const publish = useServerFn(publishLoanPolicy);

  const mutation = useMutation({
    mutationFn: async (password: string) =>
      publish({
        data: {
          interest_rate: Number(form.interest_rate),
          min_savings: Number(form.min_savings),
          savings_multiplier: Number(form.savings_multiplier),
          min_membership_months: Number(form.min_membership_months),
          max_term_months: Number(form.max_term_months),
          emergency_rate: Number(form.emergency_rate),
          emergency_multiplier: Number(form.emergency_multiplier),
          emergency_max_amount: Number(form.emergency_max_amount),
          emergency_max_term_months: Number(form.emergency_max_term_months),
          chapchap_rate: Number(form.chapchap_rate),
          late_penalty_rate: Number(form.late_penalty_rate),
          processing_fee_rate: Number(form.processing_fee_rate),
          notes: form.notes.trim() || undefined,
          password,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Policy v${r.version} published`);
      setForm({ ...defaults });
      qc.invalidateQueries({ queryKey: ["superadmin", "loan-policies"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const prefillFromCurrent = () => {
    const current = data?.[0];
    if (!current) return;
    setForm({
      interest_rate: String(current.interest_rate),
      min_savings: String(current.min_savings),
      savings_multiplier: String(current.savings_multiplier),
      min_membership_months: String(current.min_membership_months),
      max_term_months: String(current.max_term_months),
      emergency_rate: String(current.emergency_rate),
      emergency_multiplier: String(current.emergency_multiplier),
      emergency_max_amount: String(current.emergency_max_amount),
      emergency_max_term_months: String(current.emergency_max_term_months),
      chapchap_rate: String(current.chapchap_rate),
      late_penalty_rate: String(current.late_penalty_rate),
      processing_fee_rate: String(current.processing_fee_rate),
      notes: "",
    });
  };

  if (isLoading) return <PageLoader label="Loading policies…" />;
  if (error || !data) return <ErrorState onRetry={refetch} title="Failed to load loan policies" />;

  const current = data[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Loan policies</h1>
        <p className="text-sm text-muted-foreground">
          Versioned and immutable. Publishing a new version supersedes previous ones for all future eligibility
          checks. Historic versions stay for audit.
        </p>
      </header>

      {current && (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Current policy — v{current.version}</h2>
            <Badge className="ml-auto bg-success/15 text-success">Effective {fmtDate(current.effective_from)}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Metric label="Interest" value={`${current.interest_rate}%`} />
            <Metric label="Multiplier" value={`${current.savings_multiplier}×`} />
            <Metric label="Min savings" value={fmtTZS(current.min_savings)} />
            <Metric label="Max term" value={`${current.max_term_months} mo`} />
            <Metric label="Emergency rate" value={`${current.emergency_rate}%`} />
            <Metric label="Emergency max" value={fmtTZS(current.emergency_max_amount)} />
            <Metric label="Late penalty / mo" value={`${current.late_penalty_rate}%`} />
            <Metric label="Processing fee" value={`${current.processing_fee_rate}%`} />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Publish new version</h2>
          {current && (
            <Button variant="link" size="sm" className="ml-auto" onClick={prefillFromCurrent}>
              Prefill from current
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Interest rate (% p.a.)" v={form.interest_rate} step="0.1" onChange={(v) => setForm({ ...form, interest_rate: v })} />
          <Field label="Savings multiplier" v={form.savings_multiplier} step="0.1" onChange={(v) => setForm({ ...form, savings_multiplier: v })} />
          <Field label="Min savings (TZS)" v={form.min_savings} onChange={(v) => setForm({ ...form, min_savings: v })} />
          <Field label="Min membership (months)" v={form.min_membership_months} onChange={(v) => setForm({ ...form, min_membership_months: v })} />
          <Field label="Max term (months)" v={form.max_term_months} onChange={(v) => setForm({ ...form, max_term_months: v })} />
          <Field label="Processing fee (% principal)" v={form.processing_fee_rate} step="0.1" onChange={(v) => setForm({ ...form, processing_fee_rate: v })} />
          <Field label="Late penalty (% / month)" v={form.late_penalty_rate} step="0.1" onChange={(v) => setForm({ ...form, late_penalty_rate: v })} />
          <Field label="Chap-Chap rate (% p.a.)" v={form.chapchap_rate} step="0.1" onChange={(v) => setForm({ ...form, chapchap_rate: v })} />

          <div className="md:col-span-3 border-t pt-3">
            <h3 className="text-sm font-semibold text-primary">Emergency tier</h3>
          </div>
          <Field label="Emergency rate (% p.a.)" v={form.emergency_rate} step="0.1" onChange={(v) => setForm({ ...form, emergency_rate: v })} />
          <Field label="Emergency multiplier" v={form.emergency_multiplier} step="0.1" onChange={(v) => setForm({ ...form, emergency_multiplier: v })} />
          <Field label="Emergency max amount (TZS)" v={form.emergency_max_amount} onChange={(v) => setForm({ ...form, emergency_max_amount: v })} />
          <Field label="Emergency max term (months)" v={form.emergency_max_term_months} onChange={(v) => setForm({ ...form, emergency_max_term_months: v })} />

          <div className="md:col-span-3">
            <Label>Rationale / notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Why this policy change? Board memo reference, effective conditions, etc."
              rows={3}
            />
          </div>
          <div className="md:col-span-3">
            <ConfirmWithPassword
              title="Publish new policy version"
              description="Publishing creates a new immutable version that governs all future loan eligibility. Existing loans keep their original terms."
              actionLabel="Publish"
              trigger={
                <Button disabled={mutation.isPending} className="bg-[image:var(--gradient-primary)] text-primary-foreground">
                  {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Publish new version
                </Button>
              }
              onConfirmed={async (pw) => { await mutation.mutateAsync(pw); }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Version history</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Version</th>
                <th className="pr-3">Rate</th>
                <th className="pr-3">Mult</th>
                <th className="pr-3">Fee</th>
                <th className="pr-3">Penalty</th>
                <th className="pr-3">Emerg.</th>
                <th className="pr-3">Effective</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-2 pr-3 font-semibold">
                    v{p.version}
                    {i === 0 && <Badge className="ml-2 bg-success/15 text-success">Current</Badge>}
                  </td>
                  <td className="pr-3">{p.interest_rate}%</td>
                  <td className="pr-3">{p.savings_multiplier}×</td>
                  <td className="pr-3">{p.processing_fee_rate}%</td>
                  <td className="pr-3">{p.late_penalty_rate}%</td>
                  <td className="pr-3">{p.emergency_rate}%</td>
                  <td className="pr-3 text-xs text-muted-foreground">{fmtDate(p.effective_from)}</td>
                  <td className="text-xs text-muted-foreground">{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Field({
  label, v, step, onChange,
}: { label: string; v: string; step?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
