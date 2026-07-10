import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  UserCheck,
  Banknote,
  Crown,
  Wallet,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  Users,
  Gavel,
  Calculator,
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

export const Route = createFileRoute("/workflow")({
  head: () => ({
    meta: [
      { title: "Loan Workflow Guide — WASSHA SACCOS" },
      {
        name: "description",
        content:
          "Step-by-step guide to the WASSHA SACCOS loan approval workflow: submission, review, finance, board sign-off, manager approval, disbursement, repayment and completion.",
      },
      { property: "og:title", content: "Loan Workflow Guide — WASSHA SACCOS" },
      {
        property: "og:description",
        content:
          "Submission → review → finance → board (chair + 2 members) → manager → disbursement → repayment → completion, explained.",
      },
      { property: "og:url", content: "https://wassha-saccos.lovable.app/workflow" },
    ],
    links: [{ rel: "canonical", href: "https://wassha-saccos.lovable.app/workflow" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "WASSHA SACCOS loan approval workflow",
          description: "End-to-end loan approval and repayment steps in WASSHA SACCOS.",
          step: [
            {
              "@type": "HowToStep",
              name: "Submitted",
              text: "Member submits the loan application with supporting documents.",
            },
            {
              "@type": "HowToStep",
              name: "Under Review",
              text: "Branch approver verifies member details, eligibility, and documents.",
            },
            {
              "@type": "HowToStep",
              name: "Finance Review",
              text: "Finance officer reviews against treasury and risk policy.",
            },
            {
              "@type": "HowToStep",
              name: "Board Chair",
              text: "Board Chair signs off on the loan.",
            },
            { "@type": "HowToStep", name: "Board Member 1", text: "Board Member 1 signs off." },
            { "@type": "HowToStep", name: "Board Member 2", text: "Board Member 2 signs off." },
            {
              "@type": "HowToStep",
              name: "Manager Approval",
              text: "Manager grants final authorization.",
            },
            {
              "@type": "HowToStep",
              name: "Disbursement",
              text: "Manager confirms disbursement; principal is credited and fees are calculated.",
            },
            {
              "@type": "HowToStep",
              name: "Repayment & Completion",
              text: "Repayments allocate to Fees → Penalties → Principal. Loan completes when balances reach zero.",
            },
          ],
        }),
      },
    ],
  }),
  component: WorkflowGuide,
});

const STAGES = [
  {
    icon: ClipboardCheck,
    name: "Submitted",
    who: "Member",
    action:
      "Member fills the loan application, uploads up to 5 supporting documents (PDF/image, max 10MB each), and submits.",
    sla: "Instant",
  },
  {
    icon: UserCheck,
    name: "Under Review",
    who: "Branch Approver",
    action:
      "Branch approver verifies member details, savings balance, eligibility, and document authenticity. May request more documents or reject with a reason.",
    sla: "1–2 business days",
  },
  {
    icon: Banknote,
    name: "Finance Review",
    who: "Finance Officer",
    action:
      "Finance reviews the requested amount against treasury limits, interest assumptions, and risk policy. Confirms or rejects.",
    sla: "1 business day",
  },
  {
    icon: Gavel,
    name: "Board Chair",
    who: "Board Chair",
    action:
      "The Board Chair reviews the finance-approved loan and provides the first board-level sign-off.",
    sla: "1 business day",
  },
  {
    icon: Users,
    name: "Board Member 1",
    who: "Board Member 1",
    action: "Board Member 1 reviews and endorses the loan after the Chair has signed off.",
    sla: "1 business day",
  },
  {
    icon: Users,
    name: "Board Member 2",
    who: "Board Member 2",
    action:
      "Board Member 2 provides the final board endorsement before the loan advances to the Manager.",
    sla: "1 business day",
  },
  {
    icon: Crown,
    name: "Manager Approval",
    who: "Manager",
    action:
      "Final sign-off. Manager validates compliance, audit trail, and authorizes disbursement.",
    sla: "1 business day",
  },
  {
    icon: Wallet,
    name: "Disbursement",
    who: "Manager",
    action:
      "Manager confirms disbursement. The approved principal is credited to the member instantly, the loan fee is calculated and attached to this loan, and the loan becomes active with an outstanding balance.",
    sla: "Same day as manager approval",
  },
  {
    icon: CheckCircle2,
    name: "Repayment & Completion",
    who: "Automatic / Member",
    action:
      "As repayments come in, the system allocates each payment in order: Fees → Penalties → Principal. The loan is automatically marked Completed once outstanding principal, fees, and penalties all reach zero.",
    sla: "Per repayment schedule",
  },
];

function WorkflowGuide() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <section className="bg-[image:var(--gradient-hero)] py-16 text-primary-foreground">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            How it works
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            Loan workflow guide
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85">
            Every loan moves through nine clearly-defined stages — from submission and branch
            review, through finance and the three board seats, to the Manager's authorization,
            disbursement and final repayment. Members can track progress live; staff see exactly
            which approval falls in their queue.
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-4xl px-4 py-16">
        <ol className="space-y-6">
          {STAGES.map((s, i) => (
            <li
              key={s.name}
              className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Stage {i + 1}
                    </span>
                    <h2 className="text-lg font-bold text-foreground">{s.name}</h2>
                    <span className="rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
                      {s.who}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.action}</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" /> Expected SLA: {s.sla}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Calculator className="h-4 w-4 text-primary" /> How fees & repayments are handled
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              • On disbursement, the system calculates the loan fee from the approved amount using
              the active fee rule and attaches it to the loan.
            </li>
            <li>
              • The member receives the full approved principal — fees are tracked separately as an
              outstanding fee balance.
            </li>
            <li>
              • Every repayment is allocated in strict order:{" "}
              <strong className="text-foreground">Fees → Penalties → Principal</strong>.
            </li>
            <li>
              • The loan is auto-completed only when outstanding principal, outstanding fees and
              outstanding penalties are all zero.
            </li>
          </ul>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4" /> Rejection at any stage
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Any approver, finance officer, board member or manager can reject. The member receives
              an instant notification with the reason. The loan moves to <strong>Rejected</strong>{" "}
              and is closed.
            </p>
          </div>
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowRight className="h-4 w-4 text-warning" /> Documents requested & proxy approvals
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              When more evidence is needed, staff click <strong>Request documents</strong> and the
              member is notified. If a board member or approver is unavailable, a{" "}
              <strong>proxy delegation</strong> can be granted so another authorized user can act on
              that stage without breaking the audit trail.
            </p>
          </div>
        </div>

        <div className="mt-12 rounded-3xl bg-secondary p-8 text-center text-secondary-foreground">
          <h3 className="text-xl font-bold">Ready to apply?</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-secondary-foreground/80">
            Sign in to your member dashboard and submit your application in under 3 minutes.
          </p>
          <Button
            asChild
            className="mt-5 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]"
          >
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
