import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Wallet, TrendingUp, Bell, Users, FileBarChart,
  ArrowRight, CheckCircle2, Sparkles, Lock, Smartphone, BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WASSHA SACCOS — Modern Savings & Loans Platform" },
      { name: "description", content: "Secure SACCOS management for members, approvers, managers, and admins. Transparent loans, real-time notifications, fintech-grade UX." },
      { property: "og:title", content: "WASSHA SACCOS — Modern Savings & Loans Platform" },
      { property: "og:description", content: "Transparent loans, member self-service, secure approvals." },
      { property: "og:url", content: "https://wassha-saccos.lovable.app/" },
      { name: "twitter:title", content: "WASSHA SACCOS" },
      { name: "twitter:description", content: "Transparent loans, member self-service, secure approvals." },
    ],
    links: [{ rel: "canonical", href: "https://wassha-saccos.lovable.app/" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        {/* Strong dark overlay to guarantee AA contrast for white hero text against any gradient */}
        <div className="absolute inset-0 -z-10 bg-slate-950/80" aria-hidden />
        <div className="absolute inset-0 -z-10 opacity-40" aria-hidden
          style={{ backgroundImage: "radial-gradient(60% 50% at 80% 0%, oklch(0.78 0.17 60 / 0.4), transparent 60%)" }} />
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center text-white">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/60 bg-primary/15 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Built for modern SACCOS operations
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl [text-shadow:0_2px_16px_rgb(0_0_0_/_0.6)]">
              The fintech-grade<br />
              <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">SACCOS platform</span> your members deserve
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-primary/90 md:text-lg [text-shadow:0_1px_8px_rgb(0_0_0_/_0.5)]">
              Transparent savings, intelligent loan workflows, and real-time notifications — purpose built for WASSHA SACCOS members, approvers, and administrators.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
                <Link to="/dashboard">Explore Member Dashboard <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <Button size="lg" asChild variant="outline" className="border-white bg-slate-900/70 text-white hover:bg-slate-900/90 hover:text-white">
                <Link to="/workflow">View workflow guide</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-primary [text-shadow:0_1px_6px_rgb(0_0_0_/_0.5)]">
              <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Bank-grade security</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Role-based access</span>
              <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Mobile-first</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Platform</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Everything a modern SACCOS needs</h2>
          <p className="mt-3 text-muted-foreground">From member self-service to multi-stage loan approvals and audit-grade reporting.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Wallet, title: "Savings & contributions", desc: "Real-time balances, statements, and deposit notifications." },
            { icon: TrendingUp, title: "Smart loan eligibility", desc: "Auto-calculated borrowing limits based on savings & debt ratio." },
            { icon: ShieldCheck, title: "Secure approvals", desc: "Multi-stage workflow with comments and audit trail." },
            { icon: Bell, title: "Real-time notifications", desc: "Email, in-app, and SMS-ready reminders for every event." },
            { icon: FileBarChart, title: "Reports & analytics", desc: "Export PDF, Excel, CSV. Track defaulters, growth, and risk." },
            { icon: Users, title: "Role-based dashboards", desc: "Tailored experiences for members, approvers, and admins." },
          ].map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-elegant)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-[image:var(--gradient-primary)] group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="bg-secondary/[0.03] py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Tailored access</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">A dashboard for every role</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              { title: "Members", desc: "Apply for loans, track balances, view repayment schedules, and download statements.", points: ["Loan eligibility", "Repayment tracking", "Statements"] },
              { title: "Approvers & Managers", desc: "Review queues, approve or forward loans, and analyze portfolio performance.", points: ["Approval queue", "Risk insights", "Personal loans"] },
              { title: "Administrators", desc: "Manage users, policies, interest rates, audit logs, and generate reports.", points: ["Roles & policies", "Audit logs", "Exports"] },
            ].map((r, i) => (
              <div key={r.title} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[image:var(--gradient-primary)] opacity-10" />
                <span className="text-xs font-semibold text-primary">0{i + 1}</span>
                <h3 className="mt-2 text-xl font-bold text-secondary">{r.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{r.desc}</p>
                <ul className="mt-4 space-y-2">
                  {r.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-success" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow CTA */}
      <section id="workflow" className="container mx-auto px-4 py-20">
        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card p-8 shadow-[var(--shadow-card)] md:p-12">
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Loan workflow</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Total transparency, every stage of the way.</h2>
              <p className="mt-3 text-muted-foreground">Members watch their loan move through Submitted → Review → Branch → Finance → Manager → Disbursement in real time, with comments and ETAs at every step.</p>
              <div className="mt-6 flex gap-3">
                <Button asChild className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
                  <Link to="/dashboard">See it live <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/workflow">View workflow guide</Link>
                </Button>
              </div>
            </div>
            <div className="rounded-2xl bg-secondary/[0.04] p-6">
              <div className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Loan #LN-2041</p>
                  <p className="text-xs text-muted-foreground">Currently with Finance Officer</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">In Progress</span>
              </div>
              <div className="mt-4 space-y-3">
                {["Submitted", "Branch Approval", "Finance Approval", "Manager Approval"].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 text-sm">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < 2 ? "bg-success text-success-foreground" : i === 2 ? "bg-[image:var(--gradient-primary)] text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i < 2 ? "✓" : i + 1}</span>
                    <span className={i <= 2 ? "font-medium text-foreground" : "text-muted-foreground"}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-secondary text-secondary-foreground">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-8 md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)]"><Wallet className="h-4 w-4" /></div>
            <span className="text-sm font-semibold">WASSHA SACCOS</span>
          </div>
          <p className="text-xs text-secondary-foreground/60">© {new Date().getFullYear()} WASSHA SACCOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
