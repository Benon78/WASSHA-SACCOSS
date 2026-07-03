import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Bell, GitBranch, ShieldCheck, LineChart, Users, Wallet, FileText } from "lucide-react";

const URL = "https://wassha-saccos.lovable.app/guides/choosing-sacco-software";

export const Route = createFileRoute("/guides/choosing-sacco-software")({
  head: () => ({
    meta: [
      { title: "How to Choose SACCO & Credit Union Software (2026 Guide) — WASSHA SACCOS" },
      { name: "description", content: "A practical guide for SACCO and credit union decision-makers: what software cooperatives use, the must-have features, and how to pick the right platform." },
      { property: "og:title", content: "How to Choose SACCO & Credit Union Software — 2026 Guide" },
      { property: "og:description", content: "What software do credit unions use, and how do you choose the right platform for your SACCO? A decision-maker's guide." },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "How to Choose SACCO Software" },
      { name: "twitter:description", content: "A practical guide for SACCO and credit union decision-makers." },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "How to Choose SACCO & Credit Union Software",
          description: "A practical guide for SACCO and credit union decision-makers.",
          mainEntityOfPage: URL,
          author: { "@type": "Organization", name: "WASSHA SACCOS" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What software do credit unions use?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Credit unions and SACCOs typically use core banking or cooperative-management platforms that handle member records, savings and share accounts, multi-stage loan approvals, disbursements, repayments, statements, and audit logs. Modern options are web-based, mobile-friendly, and add real-time notifications, role-based approvals, and reporting dashboards.",
              },
            },
            {
              "@type": "Question",
              name: "How do I choose the right SACCO software?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Start with the workflows you actually run: member onboarding, savings, loan approval stages, disbursement, and reporting. Then check security (RLS, audit logs, role separation), usability on mobile, integrations with mobile money and payments, and whether the vendor supports your growth without per-user licensing surprises.",
              },
            },
            {
              "@type": "Question",
              name: "Do we need cloud-hosted software or on-premise?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cloud-hosted platforms remove server maintenance, keep members' data backed up, and let staff work from any device. On-premise is only worth it when regulation forces local hosting; most SACCOs today are better served by a secure multi-tenant cloud platform.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: ChoosingSaccoSoftwareGuide,
});

function Feature({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center gap-2 text-primary"><Icon className="h-5 w-5" /><h3 className="text-sm font-semibold text-foreground">{title}</h3></div>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function ChoosingSaccoSoftwareGuide() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <article className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          How to Choose SACCO &amp; Credit Union Software
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          A decision-maker's guide for SACCOs, cooperatives, and credit unions evaluating a
          digital banking platform. Covers what software credit unions actually use, the
          features that matter, and a checklist for shortlisting vendors.
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">What software do credit unions use?</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Credit unions and SACCOs run on <strong>core banking</strong> or
            <strong> cooperative-management platforms</strong>. These handle member records,
            savings and share accounts, multi-stage loan approvals, disbursement, repayment
            schedules, statements, and audit logs. Larger unions layer in mobile money and
            reporting tools; smaller SACCOs increasingly move directly to modern cloud
            platforms that bundle everything into a single web app.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">The features that actually matter</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Feature icon={GitBranch} title="Multi-stage loan workflows">
              Submitted → Review → Finance → Board → Manager → Disbursement, with a clear
              owner and SLA at every stage.
            </Feature>
            <Feature icon={Bell} title="Real-time notifications">
              Members and staff see approvals, rejections and disbursements the moment they
              happen — no more phone-tag with the loans office.
            </Feature>
            <Feature icon={ShieldCheck} title="Role separation &amp; audit logs">
              Approvers, finance officers, board members and admins each get scoped
              permissions, and every policy change is logged.
            </Feature>
            <Feature icon={Wallet} title="Savings, shares &amp; opening balances">
              Track deposits, withdrawals and share capital alongside loans so eligibility
              calculations stay accurate.
            </Feature>
            <Feature icon={LineChart} title="Dashboards &amp; exports">
              Board-ready reports on portfolio at risk, loan aging, and monthly cashflow —
              exportable to CSV, XLSX and PDF.
            </Feature>
            <Feature icon={Users} title="Member self-service">
              Members apply for loans, check balances, download statements, and update
              their profile without visiting the office.
            </Feature>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">Shortlist checklist</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              "Does it match your actual approval workflow (not the vendor's demo workflow)?",
              "Are permissions role-based, with an immutable audit log for policy changes?",
              "Can members apply, check balances, and download statements themselves?",
              "Does it show portfolio-at-risk and aging without a spreadsheet export?",
              "Is data secured with row-level access controls, backups, and encryption in transit?",
              "Are there per-user license fees that will punish you for growing?",
              "Does the vendor publish uptime, security posture, and a public roadmap?",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-3xl border border-border/70 bg-secondary p-6 text-secondary-foreground">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h2 className="text-lg font-semibold">How WASSHA SACCOS fits</h2></div>
          <p className="mt-2 text-sm">
            WASSHA SACCOS is a fintech-grade cooperative platform with the workflow,
            notification and reporting features listed above already built in — including
            multi-stage loan approvals, real-time notifications, member self-service,
            role-based admin controls with full audit logging, and dashboards for boards
            and finance officers.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild><Link to="/workflow">See the loan workflow</Link></Button>
            <Button asChild variant="outline"><Link to="/auth">Create a member account</Link></Button>
          </div>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          Last updated 2026. Written for SACCO boards, credit-union managers and cooperative
          finance officers evaluating digital banking software.
        </p>
      </article>
    </div>
  );
}
