import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/board")({
  head: () => ({ meta: [{ title: "Loan Board — WASSHA SACCOS" }] }),
  component: BoardPage,
});

const SEATS = [
  { id: "chair", label: "Board Chair" },
  { id: "member_1", label: "Board Member 1" },
  { id: "member_2", label: "Board Member 2" },
];

function BoardPage() {
  const { hasRole, loading } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: members }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, member_number"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("loan_board_members").select("seat, user_id"),
    ]);
    const staffIds = new Set((roles ?? []).filter((r) => ["approver","finance","manager","admin"].includes(r.role)).map((r) => r.user_id));
    setStaff((profiles ?? []).filter((p) => staffIds.has(p.user_id)));
    const map: Record<string, string> = {};
    (members ?? []).forEach((m) => { map[m.seat] = m.user_id; });
    setSeats(map);
  };

  useEffect(() => { if (hasRole("admin")) load(); }, []);
  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const assign = async (seat: string) => {
    const userId = draft[seat] || seats[seat];
    if (!userId) return toast.error("Pick a staff member");
    await supabase.from("loan_board_members").delete().eq("seat", seat);
    const { error } = await supabase.from("loan_board_members").insert({ seat, user_id: userId });
    if (error) return toast.error(error.message);
    toast.success(`${seat} assigned`); load();
  };

  const remove = async (seat: string) => {
    await supabase.from("loan_board_members").delete().eq("seat", seat);
    toast.success("Seat cleared"); load();
  };

  const nameOf = (uid?: string) => {
    if (!uid) return "—";
    const s = staff.find((p) => p.user_id === uid);
    return s ? `${s.member_number ? s.member_number + " — " : ""}${s.full_name || uid.slice(0,8)}` : uid.slice(0,8);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Loan board members</h1>
          <p className="text-sm text-muted-foreground">Assign staff to the chair and two member seats. These seats sign off on the board approval stages.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {SEATS.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold">{s.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Current: <span className="font-medium text-foreground">{nameOf(seats[s.id])}</span></p>
              <div className="mt-4 space-y-2">
                <Label className="text-xs">Assign staff member</Label>
                <Select value={draft[s.id] ?? seats[s.id] ?? ""} onValueChange={(v) => setDraft((p) => ({ ...p, [s.id]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.member_number ? `${p.member_number} — ` : ""}{p.full_name || p.user_id.slice(0,8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => assign(s.id)} className="bg-[image:var(--gradient-primary)] text-primary-foreground">Save</Button>
                  {seats[s.id] && <Button size="sm" variant="outline" onClick={() => remove(s.id)}>Clear</Button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <ProxySection staff={staff} />
      </div>
    </div>
  );
}

function ProxySection({ staff }: { staff: any[] }) {
  const [loans, setLoans] = useState<any[]>([]);
  const [proxies, setProxies] = useState<any[]>([]);
  const [draft, setDraft] = useState({ loan_id: "", stage: "under_review", delegate_id: "", reason: "" });

  const load = async () => {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from("loans").select("id, loan_number, stage, status, member_id").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("loan_proxies").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setLoans(l ?? []);
    setProxies(p ?? []);
  };
  useEffect(() => { load(); }, []);

  const grant = async () => {
    if (!draft.loan_id || !draft.delegate_id) return toast.error("Pick a loan and delegate");
    const { error } = await supabase.from("loan_proxies").insert({
      loan_id: draft.loan_id, stage: draft.stage as any,
      delegate_id: draft.delegate_id, granted_by: (await supabase.auth.getUser()).data.user!.id,
      reason: draft.reason || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Delegation granted (valid 7 days, one-time use)");
    setDraft({ loan_id: "", stage: "under_review", delegate_id: "", reason: "" });
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("loan_proxies").update({ consumed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Revoked"); load();
  };

  const STAGES = ["under_review","finance_approval","board_chair","board_member_1","board_member_2","manager_approval","disbursement"];
  const nameOf = (uid?: string) => staff.find((s) => s.user_id === uid)?.full_name || uid?.slice(0,8) || "—";

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">Acting reviewer (proxy)</h2>
      <p className="text-xs text-muted-foreground">Authorize a different staff member to review a specific loan when the normal reviewer has a conflict. One-time use, expires in 7 days.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <Label className="text-xs">Loan</Label>
          <Select value={draft.loan_id} onValueChange={(v) => setDraft({ ...draft, loan_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select pending loan" /></SelectTrigger>
            <SelectContent>{loans.map((l) => <SelectItem key={l.id} value={l.id}>{l.loan_number} ({l.stage})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Stage</Label>
          <Select value={draft.stage} onValueChange={(v) => setDraft({ ...draft, stage: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Delegate</Label>
          <Select value={draft.delegate_id} onValueChange={(v) => setDraft({ ...draft, delegate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>{staff.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0,8)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={grant} className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground">Grant</Button>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-border/60 text-sm">
        {proxies.length === 0 && <li className="py-3 text-muted-foreground">No delegations yet.</li>}
        {proxies.map((p) => {
          const loan = loans.find((l) => l.id === p.loan_id);
          const active = !p.consumed_at && new Date(p.expires_at) > new Date();
          return (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="font-medium">{loan?.loan_number ?? p.loan_id.slice(0,8)} · {p.stage}</p>
                <p className="text-xs text-muted-foreground">→ {nameOf(p.delegate_id)} · {active ? "active" : (p.consumed_at ? "consumed" : "expired")}</p>
              </div>
              {active && <Button size="sm" variant="outline" onClick={() => revoke(p.id)}>Revoke</Button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
