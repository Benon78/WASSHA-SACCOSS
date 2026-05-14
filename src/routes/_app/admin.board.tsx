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
      </div>
    </div>
  );
}
