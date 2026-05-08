import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — WASSHA SACCOS" }] }),
  component: AdminPage,
});

const ROLES: AppRole[] = ["member", "approver", "finance", "manager", "admin"];

function AdminPage() {
  const { hasRole, loading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tx, setTx] = useState({ user_id: "", amount: "", tx_type: "deposit", description: "" });

  const load = async () => {
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("*");
    const merged = (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
    }));
    setUsers(merged);
  };

  useEffect(() => { if (hasRole("admin")) load(); }, []);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const toggleRole = async (userId: string, role: AppRole, currentlyHas: boolean) => {
    if (currentlyHas) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    } else {
      await supabase.from("user_roles").insert({ user_id: userId, role });
    }
    toast.success("Role updated");
    load();
  };

  const recordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("transactions").insert({
      user_id: tx.user_id,
      amount: Number(tx.amount),
      tx_type: tx.tx_type as any,
      description: tx.description || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Transaction recorded"); setTx({ ...tx, amount: "", description: "" }); }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Admin</h1>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Record transaction</h2>
          <p className="text-xs text-muted-foreground">Manually post a deposit, contribution, fee or repayment.</p>
          <form onSubmit={recordTx} className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label className="text-xs">Member</Label>
              <Select value={tx.user_id} onValueChange={(v) => setTx({ ...tx, user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.member_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={tx.tx_type} onValueChange={(v) => setTx({ ...tx, tx_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["deposit","contribution","withdrawal","fee","repayment"].map((t) =>
                    <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" required value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} />
            </div>
            <div className="md:col-span-5 flex gap-3">
              <Input placeholder="Description (optional)" value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} />
              <Button type="submit" className="bg-[image:var(--gradient-primary)] text-primary-foreground">Post</Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Members & roles</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Name</th>
                  <th>Member #</th>
                  <th>Joined</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="py-3 font-medium">{u.full_name || "—"}</td>
                    <td>{u.member_number}</td>
                    <td className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</td>
                    <td>
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
