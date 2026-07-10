import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtTZS, fmtDate } from "@/lib/format";
import { STAGE_LABEL, type LoanStage } from "@/lib/loanStages";
import { Plus, FileText } from "lucide-react";

import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/loans/")({
  head: () =>
    pageHead({
      path: "/loans",
      title: "My Loans — WASSHA SACCOS",
      description:
        "Track your loan applications, balances, and repayment status across the SACCOS approval workflow.",
      noIndex: true,
    }),
  component: LoansList,
});

function LoansList() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("loans")
      .select("*")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLoans(data ?? []));
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My loans</h1>
            <p className="text-sm text-muted-foreground">
              All your loan applications and their progress.
            </p>
          </div>
          <Button
            asChild
            className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95"
          >
            <Link to="/loans/apply">
              <Plus className="mr-2 h-4 w-4" /> New application
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
          {loans.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You haven't applied for a loan yet.</p>
              <Button asChild>
                <Link to="/loans/apply">Apply now</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {loans.map((l) => (
                <li key={l.id}>
                  <Link
                    to="/loans/$loanId"
                    params={{ loanId: l.id }}
                    className="flex items-center justify-between p-5 transition hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-bold">{l.loan_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.purpose} · {fmtDate(l.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {STAGE_LABEL[l.stage as LoanStage] ?? l.stage}
                      </span>
                      <span className="text-sm font-semibold">{fmtTZS(l.amount_requested)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
