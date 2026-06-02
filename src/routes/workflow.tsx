import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck, UserCheck, Banknote, Crown, Wallet, CheckCircle2,
  XCircle, ArrowRight, Clock,
} from "lucide-react";

export const Route = createFileRoute("/workflow")({
  head: () => ({
    meta: [
      { title: "Loan Workflow Guide — WASSHA SACCOS" },
      { name: "description", content: "Step-by-step guide to the WASSHA SACCOS loan approval workflow: who acts at each stage, what they do, and expected SLAs." },
      { property: "og:title", content: "Loan Workflow Guide — WASSHA SACCOS" },
      { property: "og:description", content: "Submission → review → finance → board → manager → disbursement, explained." },
      { property: "og:url", content: "https://wassha-saccos.lovable.app/workflow" },
    ],
    links: [{ rel: "canonical", href: "https://wassha-saccos.lovable.app/workflow" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "WASSHA SACCOS loan approval workflow",
        description: "End-to-end loan approval steps in WASSHA SACCOS.",
        step: [
          { "@type": "HowToStep", name: "Submitted", text: "Member submits the loan application with supporting documents." },
          { "@type": "HowToStep", name: "Under Review", text: "Approver verifies member details, eligibility, and documents." },
          { "@type": "HowToStep", name: "Finance Approval", text: "Finance reviews against treasury and risk policy." },
          { "@type": "HowToStep", name: "Board Approval", text: "Board chair and members 1 & 2 sign off in sequence." },
          { "@type": "HowToStep", name: "Manager Approval", text: "Manager grants final authorization." },
          { "@type": "HowToStep", name: "Disbursement", text: "Manager confirms disbursement and funds are released." },
          { "@type": "HowToStep", name: "Completed", text: "Loan auto-completes once outstanding balance reaches zero." },
        ],
      }),
    }],
  }),
  component: WorkflowGuide,
});

const STAGES = [
  { icon: ClipboardCheck, name: "Submitted", who: "Member", action: "Member fills the loan application, uploads up to 5 supporting documents (PDF/image, max 10MB each), and submits.", sla: "Instant" },
  { icon: UserCheck, name: "Under Review / Branch Approval", who: "Approver", action: "Branch approver verifies member details, savings balance, eligibility, and document authenticity. May request more documents or reject with a reason.", sla: "1–2 business days" },
  { icon: Banknote, name: "Finance Approval", who: "Finance Officer", action: "Finance reviews the approved amount against treasury limits, interest assumptions, and risk policy. Confirms or rejects.", sla: "1 business day" },
  { icon: Crown, name: "Manager Approval", who: "Manager", action: "Final sign-off. Manager validates compliance, audit trail, and authorizes disbursement.", sla: "1 business day" },
  { icon: Wallet, name: "Disbursement", who: "Finance Officer", action: "Finance posts the disbursement transaction. Funds are credited to the member's account and the loan moves to 'Disbursed' with an outstanding balance.", sla: "Same day after manager approval" },
  { icon: CheckCircle2, name: "Completed", who: "Automatic / Member", action: "As the member makes repayments, the outstanding balance decreases. When it reaches zero, the loan is automatically marked Completed.", sla: "Per repayment schedule" },
];

function WorkflowGuide() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <section className="bg-[image:var(--gradient-hero)] py-16 text-primary-foreground">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">How it works</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Loan workflow guide</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85">
            Every loan moves through six clearly-defined stages. Members can track progress in real-time;
            staff see exactly which approval falls in their queue.
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-4xl px-4 py-16">
        <ol className="space-y-6">
          {STAGES.map((s, i) => (
            <li key={s.name} className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">Stage {i + 1}</span>
                    <h3 className="text-lg font-bold text-foreground">{s.name}</h3>
                    <span className="rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">{s.who}</span>
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

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4" /> Rejection at any stage
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Any approver, finance officer, or manager can reject. The member receives an instant notification with the reason.
              The loan moves to <strong>Rejected</strong> and is closed.
            </p>
          </div>
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowRight className="h-4 w-4 text-warning" /> Documents requested
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              When more evidence is needed, staff click <strong>Request documents</strong>. The member is notified and uploads additional files; the workflow stays at the current stage until reviewed again.
            </p>
          </div>
        </div>

        <div className="mt-12 rounded-3xl bg-secondary p-8 text-center text-secondary-foreground">
          <h3 className="text-xl font-bold">Ready to apply?</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-secondary-foreground/80">
            Sign in to your member dashboard and submit your application in under 3 minutes.
          </p>
          <Button asChild className="mt-5 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
