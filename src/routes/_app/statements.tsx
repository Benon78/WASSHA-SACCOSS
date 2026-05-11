import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtTZS, fmtDate } from "@/lib/format";
import { savingsStatementPdf, loanRepaymentPdf } from "@/lib/pdf";
import { downloadCSV } from "@/lib/exporters";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/statements")({
  head: () => ({ meta: [{ title: "Statements — WASSHA SACCOS" }] }),
  component: StatementsPage,
});

function StatementsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [txs, setTxs] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setProfile(p);
    })();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return { txs: [], loans: [] };
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(new Date(to).getTime() + 86400000).toISOString();
    const [{ data: t }, { data: l }] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", user.id)
        .gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: true }),
      supabase.from("loans").select("*").eq("member_id", user.id).order("created_at", { ascending: false }),
    ]);
    setTxs(t ?? []); setLoans(l ?? []);
    return { txs: t ?? [], loans: l ?? [] };
  };

  useEffect(() => { fetchData(); /* eslint-disable-line */ }, [user?.id]);

  const headerInfo = {
    memberName: profile?.full_name ?? undefined,
    memberNumber: profile?.member_number ?? undefined,
    periodLabel: `${fmtDate(from)} → ${fmtDate(to)}`,
  };

  const downloadSavingsPdf = async () => {
    const { txs: rows } = await fetchData();
    const isCredit = (t: string) => ["deposit", "contribution", "disbursement"].includes(t);
    const closing = rows.reduce((s, t) => s + (isCredit(t.tx_type) ? Number(t.amount) : -Number(t.amount)), 0);
    const doc = savingsStatementPdf({
      header: { ...headerInfo, title: "Savings Statement" },
      txs: rows, openingBalance: 0, closingBalance: closing,
    });
    doc.save(`savings-statement-${profile?.member_number ?? "member"}-${from}-${to}.pdf`);
  };

  const downloadSavingsCsv = () => {
    downloadCSV(`savings-${from}-${to}.csv`, txs.map((t) => ({
      date: t.created_at, type: t.tx_type, description: t.description ?? "", amount: t.amount,
    })));
  };

  const downloadLoanPdf = async (loan: any) => {
    const { data: rep } = await supabase.from("transactions").select("*")
      .eq("user_id", user!.id).eq("tx_type", "repayment")
      .order("created_at", { ascending: true });
    const doc = loanRepaymentPdf({
      header: { ...headerInfo, title: "Loan Repayment Statement", subtitle: loan.loan_number },
      loan, repayments: rep ?? [],
    });
    doc.save(`loan-${loan.loan_number}.pdf`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Statements</h1>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Savings statement</h2>
          <p className="text-xs text-muted-foreground">Download your full transaction history with running balance.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="flex items-end gap-2">
              <Button onClick={fetchData} variant="outline" size="sm">Refresh</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={downloadSavingsPdf} className="bg-[image:var(--gradient-primary)] text-primary-foreground">
              <FileDown className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <Button onClick={downloadSavingsCsv} variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Download CSV
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{txs.length} transaction(s) in selected period.</p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Loan repayment statements</h2>
          {loans.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No loans on record.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {loans.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold">{l.loan_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTZS(l.amount_approved || l.amount_requested)} · outstanding {fmtTZS(l.outstanding_balance)} · {l.status}
                    </p>
                  </div>
                  <Button onClick={() => downloadLoanPdf(l)} size="sm" variant="outline">
                    <FileText className="mr-2 h-4 w-4" /> Download PDF
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
