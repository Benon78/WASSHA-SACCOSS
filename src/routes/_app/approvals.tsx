import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtTZS, fmtDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_ROLE, STAGE_BOARD_SEAT, type LoanStage } from "@/lib/loanStages";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_app/approvals")({
  head: () => ({ meta: [{ title: "Approvals — WASSHA SACCOS" }] }),
  component: ApprovalsQueue,
});

function ApprovalsQueue() {
  const { roles, boardSeats, isStaff, loading } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [tab, setTab] = useState<"mine" | "all" | "history">("mine");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("loans")
        .select("*, profiles!loans_member_id_fkey(full_name, member_number)")
        .order("created_at", { ascending: false });
      // RLS will filter for staff; profiles join may not work without FK aliasing — fall back
      if (!data) {
        const { data: l2 } = await supabase.from("loans").select("*").order("created_at", { ascending: false });
        setLoans(l2 ?? []);
      } else setLoans(data);
    })();
  }, []);

  if (loading) return null;
  if (!isStaff) return <Navigate to="/dashboard" />;

  const roleStages: LoanStage[] = (Object.entries(STAGE_ROLE) as [LoanStage, string][])
    .filter(([, role]) => roles.includes(role as any))
    .map(([s]) => s);
  const seatStages: LoanStage[] = (Object.entries(STAGE_BOARD_SEAT) as [LoanStage, string][])
    .filter(([, seat]) => boardSeats.includes(seat as any))
    .map(([s]) => s);
  const myStages: LoanStage[] = [...roleStages, ...seatStages];

  const mine = loans.filter((l) => myStages.includes(l.stage) && l.status === "pending");
  const allOpen = loans.filter((l) => l.status === "pending");
  const history = loans.filter((l) => l.status !== "pending");

  const Card = ({ list }: { list: any[] }) => (
    list.length === 0 ? (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-12 text-center text-sm text-muted-foreground">
        <Inbox className="h-8 w-8" /> Nothing here.
      </div>
    ) : (
      <div className="rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
        <ul className="divide-y divide-border/70">
          {list.map((l) => (
            <li key={l.id}>
              <Link to="/loans/$loanId" params={{ loanId: l.id }} className="flex items-center justify-between gap-4 p-4 transition hover:bg-muted/50">
                <div>
                  <p className="text-sm font-bold">{l.loan_number}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{l.purpose}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Submitted {fmtDate(l.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {STAGE_LABEL[l.stage as LoanStage]}
                  </span>
                  <span className="hidden text-sm font-bold sm:inline">{fmtTZS(l.amount_requested)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Approvals queue</h1>
          <p className="text-sm text-muted-foreground">
            Review and act on loan applications. Your roles: {roles.join(", ")}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="mine">Awaiting me ({mine.length})</TabsTrigger>
            <TabsTrigger value="all">All open ({allOpen.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4"><Card list={mine} /></TabsContent>
          <TabsContent value="all" className="mt-4"><Card list={allOpen} /></TabsContent>
          <TabsContent value="history" className="mt-4"><Card list={history} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
