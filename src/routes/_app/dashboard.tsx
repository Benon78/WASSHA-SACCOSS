import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { fmtTZS, fmtDate } from "@/lib/format";
import {
  Wallet, PiggyBank, TrendingUp, Banknote, ArrowUpRight, ArrowDownRight, ChevronRight, Plus,
} from "lucide-react";
import { ContributionsBarChart } from "@/components/ContributionsBarChart";
import { RepaymentTrendChart } from "@/components/RepaymentTrendChart";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — WASSHA SACCOS" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, roles, isStaff } = useAuth();
  const { t } = useI18n();
  const [savings, setSavings] = useState(0);
  const [activeLoan, setActiveLoan] = useState(0);
  const [eligibility, setEligibility] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [p, s, a, e, l, tx] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("get_savings_balance", { _user_id: user.id }),
      supabase.rpc("get_active_loan_balance", { _user_id: user.id }),
      supabase.rpc("calculate_eligibility", { _user_id: user.id }),
      supabase.from("loans").select("*").eq("member_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
    ]);
    setProfile(p.data);
    setSavings(Number(s.data ?? 0));
    setActiveLoan(Number(a.data ?? 0));
    setEligibility(e.data);
    setLoans(l.data ?? []);
    setTxs(tx.data ?? []);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const ch = supabase
      .channel(`dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "loans", filter: `member_id=eq.${user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        {/* Welcome */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-[image:var(--gradient-hero)] p-5 text-primary-foreground shadow-[var(--shadow-card)] sm:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/80">{t("welcome_back")}</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl md:text-3xl">
              {profile?.full_name?.split(" ")[0] || t("member")} 👋
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              {t("member_number")}: {profile?.member_number ?? "—"} · {roles.join(", ") || "member"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="bg-white text-secondary hover:bg-white/90">
              <Link to="/loans/apply">
                <Plus className="mr-2 h-4 w-4" /> {t("apply_for_loan")}
              </Link>
            </Button>
            {isStaff && (
              <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link to="/approvals">{t("open_approvals")}</Link>
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("total_savings")} value={fmtTZS(savings)} icon={PiggyBank} tone="primary" />
          <StatCard label={t("active_loan_balance")} value={fmtTZS(activeLoan)} icon={Banknote} tone="navy" />
          <StatCard
            label={t("eligible_to_borrow")}
            value={fmtTZS(eligibility?.max_amount ?? 0)}
            icon={TrendingUp}
            tone={eligibility?.eligible ? "success" : "warning"}
          />
          <StatCard label={t("active_loans")} value={String(loans.filter((l) => ["pending","approved","disbursed"].includes(l.status)).length)} icon={Wallet} tone="warning" />
        </div>

        {/* Eligibility reasons */}
        {eligibility && !eligibility.eligible && eligibility.reasons?.length > 0 && (
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-5">
            <p className="text-sm font-semibold text-foreground">Why you're not eligible right now</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {eligibility.reasons.map((r: any, i: number) => (
                <li key={i} className="flex gap-2"><span className="text-warning">•</span> {r.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Transactions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("recent_transactions")}</h2>
            </div>
            {txs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("no_transactions")}</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {txs.map((tx) => {
                  const isIn = ["deposit","contribution"].includes(tx.tx_type);
                  return (
                    <li key={tx.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isIn ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {isIn ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">{tx.description || tx.tx_type.replace("_", " ")}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(tx.created_at)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${isIn ? "text-success" : "text-foreground"}`}>
                        {isIn ? "+" : "-"}{fmtTZS(tx.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("recent_loans")}</h2>
              <Link to="/loans" className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                {t("view_all")} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {loans.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("no_loans")}</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {loans.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold">{l.loan_number}</p>
                      <p className="text-xs text-muted-foreground capitalize">{l.stage.replace(/_/g, " ")}</p>
                    </div>
                    <span className="text-sm font-semibold">{fmtTZS(l.amount_requested)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
