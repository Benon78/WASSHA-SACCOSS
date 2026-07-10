import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtTZS } from "@/lib/format";
import { LOAN_TYPE_LABEL } from "@/lib/loanStages";
import { Calculator, TrendingUp, AlertTriangle } from "lucide-react";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/loans/simulator")({
  head: () =>
    pageHead({
      path: "/loans/simulator",
      title: "Loan simulator — WASSHA SACCOS",
      description:
        "Estimate monthly repayments, total interest, processing fees and late-penalty exposure before applying.",
      noIndex: true,
    }),
  component: SimulatorPage,
});

type LoanType = "development" | "chapchap" | "emergency";

function pmt(principal: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function SimulatorPage() {
  const [policy, setPolicy] = useState<any>(null);
  const [type, setType] = useState<LoanType>("development");
  const [amount, setAmount] = useState("1000000");
  const [term, setTerm] = useState("12");
  const [missedMonths, setMissedMonths] = useState("0");

  useEffect(() => {
    // current_policy() is SECURITY DEFINER so members can read the active
    // policy without needing SELECT on loan_policies (which is staff-only).
    supabase.rpc("current_policy").then(({ data, error }) => {
      if (error) {
        console.error("current_policy failed", error);
        setPolicy(null);
        return;
      }
      // RPC returns a single record (row) or null.
      setPolicy(Array.isArray(data) ? (data[0] ?? null) : (data ?? null));
    });
  }, []);

  const result = useMemo(() => {
    if (!policy) return null;
    const p = Math.max(0, Number(amount) || 0);
    const n = Math.max(1, Number(term) || 1);
    const rate =
      type === "emergency"
        ? Number(policy.emergency_rate)
        : type === "chapchap"
          ? Number(policy.chapchap_rate)
          : Number(policy.interest_rate);
    const feeRate = Number(policy.processing_fee_rate ?? 0);
    const penaltyRate = Number(policy.late_penalty_rate ?? 0);

    const monthly = pmt(p, rate, n);
    const totalPaid = monthly * n;
    const totalInterest = totalPaid - p;
    const fee = (p * feeRate) / 100;
    const net = p - fee;
    const missed = Math.max(0, Number(missedMonths) || 0);
    const penalty = missed > 0 ? (monthly * missed * penaltyRate) / 100 : 0;

    return {
      rate,
      feeRate,
      penaltyRate,
      monthly,
      totalPaid,
      totalInterest,
      fee,
      net,
      penalty,
      missed,
    };
  }, [policy, type, amount, term, missedMonths]);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Calculator className="h-6 w-6 text-primary" /> Loan simulator
          </h1>
          <p className="text-sm text-muted-foreground">
            Preview repayments before you apply. Uses the current active loan policy — no
            application is created.
          </p>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)] md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Loan type</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(["development", "chapchap", "emergency"] as LoanType[]).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={type === k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType(k)}
                  className={
                    type === k ? "bg-[image:var(--gradient-primary)] text-primary-foreground" : ""
                  }
                >
                  {LOAN_TYPE_LABEL[k]}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Amount (TZS)</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Term (months)</Label>
            <Input type="number" min="1" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Missed instalments (for penalty
              preview)
            </Label>
            <Input
              type="number"
              min="0"
              value={missedMonths}
              onChange={(e) => setMissedMonths(e.target.value)}
            />
          </div>
        </section>

        {!policy && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
            No active loan policy found. An admin must publish a policy first.
          </p>
        )}

        {result && (
          <section className="grid gap-4 md:grid-cols-2">
            <Card
              label="Monthly instalment"
              value={fmtTZS(Math.round(result.monthly))}
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
            />
            <Card
              label={`Total repayable (${term} mo)`}
              value={fmtTZS(Math.round(result.totalPaid))}
            />
            <Card label="Total interest" value={fmtTZS(Math.round(result.totalInterest))} />
            <Card
              label={`Processing fee (${result.feeRate}%)`}
              value={fmtTZS(Math.round(result.fee))}
              sub={`Net disbursed: ${fmtTZS(Math.round(result.net))}`}
            />
            <Card
              label={`Late-payment penalty (${result.penaltyRate}% / month)`}
              value={fmtTZS(Math.round(result.penalty))}
              sub={
                result.missed > 0
                  ? `Applied for ${result.missed} missed instalment(s)`
                  : "No missed instalments"
              }
            />
            <Card
              label="Annual rate"
              value={`${result.rate}%`}
              sub={`Effective monthly ≈ ${(result.rate / 12).toFixed(2)}%`}
            />
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Estimates only. Final terms are confirmed at approval and are subject to the policy
          version effective on your disbursement date.
        </p>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
