import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { StatCard } from "@/components/StatCard";
import { SavingsChart } from "@/components/SavingsChart";
import { LoanWorkflow } from "@/components/LoanWorkflow";
import { Button } from "@/components/ui/button";
import {
  Wallet, PiggyBank, TrendingUp, Receipt, Bell, ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Banknote, FileText, Settings, Users, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Member Dashboard — WASSHA SACCOS" }],
  }),
  component: Dashboard,
});

const navItems = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: PiggyBank, label: "Savings" },
  { icon: Banknote, label: "Loans" },
  { icon: Receipt, label: "Transactions" },
  { icon: FileText, label: "Statements" },
  { icon: Users, label: "Approvals" },
  { icon: Settings, label: "Settings" },
];

const transactions = [
  { t: "Monthly contribution", d: "Aug 02, 2025", a: "+250,000", in: true },
  { t: "Loan repayment · LN-1894", d: "Jul 28, 2025", a: "-180,000", in: false },
  { t: "Mobile deposit", d: "Jul 21, 2025", a: "+500,000", in: true },
  { t: "Service fee", d: "Jul 18, 2025", a: "-3,500", in: false },
  { t: "Salary contribution", d: "Jul 02, 2025", a: "+250,000", in: true },
];

function Dashboard() {
  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto grid grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 rounded-2xl border border-border/70 bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Member Portal</p>
            </div>
            <ul className="space-y-1">
              {navItems.map((n) => (
                <li key={n.label}>
                  <button
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      n.active
                        ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold text-secondary">Eligible to borrow</p>
              <p className="mt-1 text-lg font-bold text-primary">TZS 4.2M</p>
              <Button size="sm" className="mt-3 w-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
                Apply for loan
              </Button>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="space-y-6">
          {/* Welcome */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-[image:var(--gradient-hero)] p-6 text-primary-foreground shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Welcome back</p>
              <h1 className="mt-1 text-2xl font-bold md:text-3xl">Hello, Amina 👋</h1>
              <p className="mt-1 text-sm text-white/70">Here's a snapshot of your SACCOS account today.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <Bell className="mr-2 h-4 w-4" /> 3 new
              </Button>
              <Button asChild className="bg-white text-secondary hover:bg-white/90">
                <Link to="/">Back to site</Link>
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total savings" value="TZS 2,510,000" delta="+18.4% YTD" icon={PiggyBank} tone="primary" />
            <StatCard label="Active loan balance" value="TZS 1,120,000" delta="-12% this qtr" icon={Banknote} tone="navy" />
            <StatCard label="Eligible to borrow" value="TZS 4,200,000" icon={TrendingUp} tone="success" />
            <StatCard label="Next repayment" value="TZS 180,000" delta="Due Aug 28" icon={Wallet} tone="warning" />
          </div>

          {/* Workflow */}
          <LoanWorkflow />

          {/* Charts + transactions */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <SavingsChart />

            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">Recent transactions</h3>
                <button className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="divide-y divide-border/70">
                {transactions.map((tx) => (
                  <li key={tx.t} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tx.in ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {tx.in ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{tx.t}</p>
                        <p className="text-xs text-muted-foreground">{tx.d}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${tx.in ? "text-success" : "text-foreground"}`}>TZS {tx.a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-base font-semibold">Notifications</h3>
            <ul className="mt-4 space-y-3">
              {[
                { t: "Loan LN-2041 reached Finance Approval stage", d: "2h ago", tone: "primary" },
                { t: "Deposit of TZS 250,000 received", d: "Yesterday", tone: "success" },
                { t: "Repayment due in 7 days — TZS 180,000", d: "2 days ago", tone: "warning" },
              ].map((n) => (
                <li key={n.t} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
                  <span className={`mt-1 h-2 w-2 rounded-full ${n.tone === "primary" ? "bg-primary" : n.tone === "success" ? "bg-success" : "bg-warning"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{n.t}</p>
                    <p className="text-xs text-muted-foreground">{n.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
