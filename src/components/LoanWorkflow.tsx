import {
  Check,
  Clock,
  FileText,
  ShieldCheck,
  Banknote,
  UserCheck,
  Building2,
  Sparkles,
} from "lucide-react";

const stages = [
  { label: "Submitted", icon: FileText, status: "done" },
  { label: "Under Review", icon: Clock, status: "done" },
  { label: "Branch Approval", icon: Building2, status: "done" },
  { label: "Finance Approval", icon: ShieldCheck, status: "active" },
  { label: "Manager Approval", icon: UserCheck, status: "todo" },
  { label: "Disbursement", icon: Banknote, status: "todo" },
  { label: "Completed", icon: Sparkles, status: "todo" },
];

export function LoanWorkflow() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Loan #LN-2041 — Workflow</h3>
          <p className="text-xs text-muted-foreground">
            Currently with Finance Officer · est. 1 day remaining
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          In Progress
        </span>
      </div>

      <ol className="relative grid grid-cols-1 gap-4 md:grid-cols-7">
        {stages.map((s, i) => {
          const Icon = s.status === "done" ? Check : s.icon;
          const ring =
            s.status === "done"
              ? "bg-success text-success-foreground"
              : s.status === "active"
                ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] ring-4 ring-primary/15"
                : "bg-muted text-muted-foreground";
          return (
            <li key={s.label} className="relative flex flex-col items-center text-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${ring}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-tight text-foreground">
                {s.label}
              </p>
              {i < stages.length - 1 && (
                <span
                  className="absolute left-[58%] top-5 hidden h-0.5 w-[84%] bg-border md:block"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
