import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtTZS } from "@/lib/format";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — WASSHA SACCOS" }] }),
  component: AdminPage,
});

const ROLES: AppRole[] = ["member", "approver", "finance", "manager", "admin"];

function AdminPage() {
  const { hasRole, loading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [tx, setTx] = useState({ user_id: "", amount: "", tx_type: "deposit", description: "", loan_id: "" });
  const [memberNumberDraft, setMemberNumberDraft] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: loans }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("loans").select("id, loan_number, member_id, amount_approved, amount_requested, outstanding_balance, status").in("status", ["disbursed", "approved"]),
    ]);
    const merged = (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
    }));
    setUsers(merged);
    setActiveLoans(loans ?? []);
  };

  useEffect(() => { if (hasRole("admin")) load(); }, []);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const toggleRole = async (userId: string, role: AppRole, currentlyHas: boolean) => {
    if (currentlyHas) await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    else await supabase.from("user_roles").insert({ user_id: userId, role });
    toast.success("Role updated"); load();
  };

  const memberLoans = useMemo(() => activeLoans.filter((l) => l.member_id === tx.user_id), [activeLoans, tx.user_id]);
  const needsLoanLink = ["repayment", "fee"].includes(tx.tx_type);

  const recordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsLoanLink && !tx.loan_id) return toast.error("Select the loan this " + tx.tx_type + " applies to");
    const { error } = await supabase.from("transactions").insert({
      user_id: tx.user_id,
      amount: Number(tx.amount),
      tx_type: tx.tx_type as any,
      description: tx.description || null,
      loan_id: needsLoanLink ? tx.loan_id : null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Transaction recorded"); setTx({ ...tx, amount: "", description: "", loan_id: "" }); load(); }
  };

  const saveMemberNumber = async (userId: string) => {
    const value = memberNumberDraft[userId]?.trim();
    if (!value) return toast.error("Member number is required");
    const { error } = await supabase.from("profiles").update({ member_number: value }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success("Member number saved"); load(); }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Admin</h1>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Record transaction</h2>
          <p className="text-xs text-muted-foreground">Manually post a deposit, contribution, fee or loan repayment. Repayments and fees must be linked to a specific loan.</p>
          <form onSubmit={recordTx} className="mt-4 grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label className="text-xs">Member</Label>
              <Select value={tx.user_id} onValueChange={(v) => setTx({ ...tx, user_id: v, loan_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.member_number ? `${u.member_number} — ` : ""}{u.full_name || u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={tx.tx_type} onValueChange={(v) => setTx({ ...tx, tx_type: v, loan_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["deposit", "contribution", "withdrawal", "fee", "repayment"].map((t) =>
                    <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" required value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} />
            </div>
            {needsLoanLink && (
              <div className="md:col-span-2">
                <Label className="text-xs">Apply to loan</Label>
                <Select value={tx.loan_id} onValueChange={(v) => setTx({ ...tx, loan_id: v })}>
                  <SelectTrigger><SelectValue placeholder={memberLoans.length ? "Select loan" : "No active loans"} /></SelectTrigger>
                  <SelectContent>
                    {memberLoans.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.loan_number} — {fmtTZS(l.outstanding_balance)} outstanding
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="md:col-span-6 flex gap-3">
              <Input placeholder="Description (optional)" value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} />
              <Button type="submit" className="bg-[image:var(--gradient-primary)] text-primary-foreground">Post</Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Members & roles</h2>
          <p className="text-xs text-muted-foreground">Assign each member a unique member number. Numbers are not auto-generated.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Name</th>
                  <th>Member #</th>
                  <th>Joined SACCOS</th>
                  <th>Opening balance (TZS)</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="py-3 font-medium">{u.full_name || "—"}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Input
                          defaultValue={u.member_number ?? ""}
                          placeholder="WS-001"
                          className="h-8 w-[120px] text-xs"
                          onChange={(e) => setMemberNumberDraft((p) => ({ ...p, [u.user_id]: e.target.value }))}
                        />
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => saveMemberNumber(u.user_id)}>Save</Button>
                      </div>
                    </td>
                    <td>
                      <Input
                        type="date"
                        defaultValue={u.joined_at ? new Date(u.joined_at).toISOString().slice(0, 10) : ""}
                        className="h-8 w-[140px] text-xs"
                        onBlur={async (e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const { error } = await supabase.from("profiles")
                            .update({ joined_at: new Date(v).toISOString() })
                            .eq("user_id", u.user_id);
                          if (error) toast.error(error.message);
                          else { toast.success("Join date updated"); load(); }
                        }}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        defaultValue={u.opening_balance ?? 0}
                        className="h-8 w-[140px] text-xs"
                        onBlur={async (e) => {
                          const v = Number(e.target.value);
                          if (Number.isNaN(v) || v < 0) return;
                          const { error } = await supabase.from("profiles")
                            .update({ opening_balance: v }).eq("user_id", u.user_id);
                          if (error) toast.error(error.message);
                          else { toast.success("Opening balance updated"); load(); }
                        }}
                      />
                    </td>
                      <div className="flex flex-wrap gap-1">
                        {ROLES.map((r) => {
                          const has = u.roles.includes(r);
                          return (
                            <button key={r} onClick={() => toggleRole(u.user_id, r, has)}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition ${
                                has ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}>
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </td>
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
