import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtTZS } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { Plus, History } from "lucide-react";

export const Route = createFileRoute("/_app/admin/policies")({
  head: () => ({ meta: [{ title: "Loan Policies — Admin" }] }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const { hasRole, loading, user } = useAuth();
  const [policies, setPolicies] = useState<any[]>([]);
  const [form, setForm] = useState({
    interest_rate: "12.0", min_savings: "100000", savings_multiplier: "3",
    min_membership_months: "3", max_term_months: "36", notes: "",
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("loan_policies").select("*").order("version", { ascending: false });
    setPolicies(data ?? []);
  };
  useEffect(() => { if (hasRole("admin")) load(); }, []);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const nextVersion = (policies[0]?.version ?? 0) + 1;
    const { error } = await supabase.from("loan_policies").insert({
      version: nextVersion,
      interest_rate: Number(form.interest_rate),
      min_savings: Number(form.min_savings),
      savings_multiplier: Number(form.savings_multiplier),
      min_membership_months: Number(form.min_membership_months),
      max_term_months: Number(form.max_term_months),
      notes: form.notes || null,
      created_by: user!.id,
    });
    setBusy(false);
    if (error) toast.error(friendlyError(error));
    else { toast.success(`Policy v${nextVersion} created`); load(); }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Loan policies</h1>
          <p className="text-sm text-muted-foreground">Versioned. New entries become effective immediately and apply to all future eligibility checks.</p>
        </div>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plus className="h-4 w-4 text-primary" /> Publish new policy version
          </h2>
          <form onSubmit={create} className="mt-4 grid gap-4 md:grid-cols-3">
            <div><Label>Interest rate (% p.a.)</Label><Input type="number" step="0.1" required value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></div>
            <div><Label>Savings multiplier</Label><Input type="number" step="0.1" required value={form.savings_multiplier} onChange={(e) => setForm({ ...form, savings_multiplier: e.target.value })} /></div>
            <div><Label>Min savings (TZS)</Label><Input type="number" required value={form.min_savings} onChange={(e) => setForm({ ...form, min_savings: e.target.value })} /></div>
            <div><Label>Min membership (months)</Label><Input type="number" required value={form.min_membership_months} onChange={(e) => setForm({ ...form, min_membership_months: e.target.value })} /></div>
            <div><Label>Max term (months)</Label><Input type="number" required value={form.max_term_months} onChange={(e) => setForm({ ...form, max_term_months: e.target.value })} /></div>
            <div className="md:col-span-3"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reason for this policy update..." /></div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-primary)] text-primary-foreground">Publish version</Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-primary" /> Version history
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Version</th><th>Rate</th><th>Multiplier</th>
                  <th>Min savings</th><th>Min months</th><th>Max term</th>
                  <th>Effective from</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-3 font-bold">
                      v{p.version}
                      {i === 0 && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">CURRENT</span>}
                    </td>
                    <td>{p.interest_rate}%</td>
                    <td>{p.savings_multiplier}×</td>
                    <td>{fmtTZS(p.min_savings)}</td>
                    <td>{p.min_membership_months}</td>
                    <td>{p.max_term_months}</td>
                    <td className="text-xs text-muted-foreground">{fmtDate(p.effective_from)}</td>
                    <td className="text-xs text-muted-foreground">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
