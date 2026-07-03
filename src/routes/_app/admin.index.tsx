import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { fmtTZS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { FilePlus2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/")({
  head: () => ({ meta: [{ title: "Admin — WASSHA SACCOS" }] }),
  component: AdminPage,
});

const ROLES: AppRole[] = ["member", "approver", "finance", "manager", "admin"];
const SUPER_ADMIN_ONLY_ROLES: AppRole[] = ["admin", "super_admin"];

function AdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const visibleRoles = isSuperAdmin ? ROLES : ROLES.filter((r) => !SUPER_ADMIN_ONLY_ROLES.includes(r));
  const { t } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [tx, setTx] = useState({ user_id: "", amount: "", tx_type: "deposit", description: "", loan_id: "" });
  const [memberNumberDraft, setMemberNumberDraft] = useState<Record<string, string>>({});
  const [regOpen, setRegOpen] = useState(false);
  const [reg, setReg] = useState({ member_id: "", amount: "", outstanding: "", stage: "disbursement", loan_type: "development", term_months: "12", purpose: "" });
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!hasRole("admin")) return;
    load();
    const ch = supabase.channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "loans" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, hasRole]);

  const submitRegister = async () => {
    setRegErrors({});
    const errs: Record<string, string> = {};
    if (!reg.member_id) errs.member_id = "Select a member";
    const amount = Number(reg.amount);
    const outstanding = Number(reg.outstanding || reg.amount);
    const term = Number(reg.term_months || 12);
    if (!(amount > 0)) errs.amount = "Must be greater than zero";
    if (outstanding < 0) errs.outstanding = "Cannot be negative";
    if (outstanding > amount) errs.outstanding = "Cannot exceed original amount";
    if (!(term > 0)) errs.term_months = "Must be at least 1 month";
    if (Object.keys(errs).length) { setRegErrors(errs); return toast.error("Fix the highlighted fields"); }
    const { error } = await supabase.rpc("admin_register_existing_loan", {
      _member_id: reg.member_id, _amount: amount, _outstanding: outstanding,
      _stage: reg.stage as any, _loan_type: reg.loan_type as any,
      _term_months: term, _purpose: reg.purpose || "Pre-existing loan migrated by admin",
    });
    if (error) {
      const m = /field=([a-z_]+);\s*(.+)/i.exec(error.message);
      if (m) { setRegErrors({ [m[1]]: m[2] }); return toast.error(m[2]); }
      return toast.error(friendlyError(error));
    }
    toast.success("Existing loan registered");
    setRegOpen(false);
    setReg({ member_id: "", amount: "", outstanding: "", stage: "disbursement", loan_type: "development", term_months: "12", purpose: "" });
    load();
  };

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const toggleRole = async (userId: string, role: AppRole, currentlyHas: boolean) => {
    if (SUPER_ADMIN_ONLY_ROLES.includes(role) && !isSuperAdmin) {
      return toast.error("Only a Super Admin can assign the Admin role.");
    }
    if (currentlyHas) await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
    else await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    toast.success("Role updated"); load();
  };

  const memberLoans = useMemo(() => activeLoans.filter((l) => l.member_id === tx.user_id), [activeLoans, tx.user_id]);
  const needsLoanLink = ["repayment", "fee", "loan_fee"].includes(tx.tx_type);

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
    if (error) toast.error(friendlyError(error));
    else { toast.success("Transaction recorded"); setTx({ ...tx, amount: "", description: "", loan_id: "" }); load(); }
  };

  const saveMemberNumber = async (userId: string) => {
    const value = memberNumberDraft[userId]?.trim();
    if (!value) return toast.error("Member number is required");
    const { error } = await supabase.from("profiles").update({ member_number: value }).eq("user_id", userId);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Member number saved"); load(); }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Admin</h1>
          <Dialog open={regOpen} onOpenChange={setRegOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[image:var(--gradient-primary)] text-primary-foreground">
                <FilePlus2 className="mr-2 h-4 w-4" /> {t("register_existing_loan")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("register_existing_loan")}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">{t("register_existing_intro")}</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs" htmlFor="reg-member">Member</Label>
                  <Select value={reg.member_id} onValueChange={(v) => setReg({ ...reg, member_id: v })}>
                    <SelectTrigger id="reg-member" aria-invalid={!!regErrors.member_id} className={regErrors.member_id ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.member_number ? `${u.member_number} — ` : ""}{u.full_name || u.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {regErrors.member_id && <p className="mt-1 text-xs text-destructive">{regErrors.member_id}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs" htmlFor="reg-amount">Original amount (TZS)</Label>
                    <Input id="reg-amount" type="number" value={reg.amount} aria-invalid={!!regErrors.amount}
                      className={regErrors.amount ? "border-destructive focus-visible:ring-destructive" : ""}
                      onChange={(e) => setReg({ ...reg, amount: e.target.value })} />
                    {regErrors.amount && <p className="mt-1 text-xs text-destructive">{regErrors.amount}</p>}
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="reg-outstanding">Outstanding (TZS)</Label>
                    <Input id="reg-outstanding" type="number" value={reg.outstanding} aria-invalid={!!regErrors.outstanding}
                      className={regErrors.outstanding ? "border-destructive focus-visible:ring-destructive" : ""}
                      onChange={(e) => setReg({ ...reg, outstanding: e.target.value })} />
                    {regErrors.outstanding && <p className="mt-1 text-xs text-destructive">{regErrors.outstanding}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs" htmlFor="reg-type">Loan type</Label>
                    <Select value={reg.loan_type} onValueChange={(v) => setReg({ ...reg, loan_type: v })}>
                      <SelectTrigger id="reg-type" className={regErrors.loan_type ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["development", "chapchap", "emergency"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {regErrors.loan_type && <p className="mt-1 text-xs text-destructive">{regErrors.loan_type}</p>}
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="reg-term">Term (months)</Label>
                    <Input id="reg-term" type="number" value={reg.term_months} aria-invalid={!!regErrors.term_months}
                      className={regErrors.term_months ? "border-destructive focus-visible:ring-destructive" : ""}
                      onChange={(e) => setReg({ ...reg, term_months: e.target.value })} />
                    {regErrors.term_months && <p className="mt-1 text-xs text-destructive">{regErrors.term_months}</p>}
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="reg-stage">Stage</Label>
                    <Select value={reg.stage} onValueChange={(v) => setReg({ ...reg, stage: v })}>
                      <SelectTrigger id="reg-stage" className={regErrors.stage ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["disbursement", "completed"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {regErrors.stage && <p className="mt-1 text-xs text-destructive">{regErrors.stage}</p>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs" htmlFor="reg-purpose">Purpose</Label>
                  <Input id="reg-purpose" value={reg.purpose} onChange={(e) => setReg({ ...reg, purpose: e.target.value })} placeholder="Pre-existing loan migrated by admin" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegOpen(false)}>{t("cancel")}</Button>
                <Button onClick={submitRegister} className="bg-[image:var(--gradient-primary)] text-primary-foreground">{t("save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Record transaction</h2>
          <p className="text-xs text-muted-foreground">Deposit, contribution, withdrawal, standalone fee, loan-fee payment or repayment. Loan repayments and loan-fee payments must be linked to a specific loan and will not touch the member's savings balance.</p>
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
                  {["deposit", "contribution", "withdrawal", "fee", "loan_fee", "repayment"].map((t) =>
                    <SelectItem key={t} value={t}>{t === "loan_fee" ? "Loan fee (returned fee)" : t}</SelectItem>)}
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
                          if (error) toast.error(friendlyError(error));
                          else { toast.success("Join date updated"); load(); }
                        }}
                      />
                    </td>
                    <td>
                      {Number(u.opening_balance ?? 0) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{Number(u.opening_balance).toLocaleString()}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">locked</span>
                        </div>
                      ) : (
                        <Input
                          type="number"
                          defaultValue={0}
                          className="h-8 w-[140px] text-xs"
                          onBlur={async (e) => {
                            const v = Number(e.target.value);
                            if (Number.isNaN(v) || v < 0) return;
                            if (v === 0) return;
                            if (!confirm(`Set opening balance to TZS ${v.toLocaleString()}? This can only be set once.`)) return;
                            const { error } = await supabase.from("profiles")
                              .update({ opening_balance: v }).eq("user_id", u.user_id);
                            if (error) toast.error(friendlyError(error));
                            else { toast.success("Opening balance set"); load(); }
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {visibleRoles.map((r) => {
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
