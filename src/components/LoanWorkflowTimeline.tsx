import { Check } from "lucide-react";
import { STAGE_ORDER, STAGE_LABEL, type LoanStage } from "@/lib/loanStages";

interface Props {
  currentStage: LoanStage;
  status?: string;
  loanNumber?: string;
}

export function LoanWorkflowTimeline({ currentStage, status, loanNumber }: Props) {
  const isRejected = status === "rejected" || currentStage === "rejected";
  const currentIdx = isRejected ? -1 : STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {loanNumber ? `Loan ${loanNumber} — Workflow` : "Loan Workflow"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isRejected ? "Application was rejected." : `Currently at: ${STAGE_LABEL[currentStage] ?? currentStage}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isRejected ? "bg-destructive/10 text-destructive" :
          currentStage === "completed" ? "bg-success/10 text-success" :
          "bg-primary/10 text-primary"
        }`}>
          {isRejected ? "Rejected" : currentStage === "completed" ? "Completed" : "In Progress"}
        </span>
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <ol className="relative flex min-w-max items-start gap-4 md:gap-2 lg:grid lg:grid-cols-9 lg:min-w-0">
          {STAGE_ORDER.map((stage, i) => {
            const done = !isRejected && i < currentIdx;
            const active = !isRejected && i === currentIdx;
            const ring =
              done ? "bg-success text-success-foreground"
              : active ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] ring-4 ring-primary/15"
              : "bg-muted text-muted-foreground";
            return (
              <li key={stage} className="flex w-24 shrink-0 flex-col items-center text-center lg:w-auto">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${ring}`}>
                  {done ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </div>
                <p className="mt-2 text-[11px] font-semibold leading-tight text-foreground break-words">{STAGE_LABEL[stage]}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
