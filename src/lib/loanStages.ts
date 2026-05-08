export type LoanStage =
  | "submitted" | "under_review" | "branch_approval"
  | "finance_approval" | "manager_approval" | "disbursement"
  | "completed" | "rejected";

// Approver -> Finance -> Manager -> Disbursement
export const STAGE_ORDER: LoanStage[] = [
  "submitted",
  "under_review",
  "branch_approval",
  "finance_approval",
  "manager_approval",
  "disbursement",
  "completed",
];

export const STAGE_LABEL: Record<LoanStage, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  branch_approval: "Branch Approval",
  finance_approval: "Finance Approval",
  manager_approval: "Manager Approval",
  disbursement: "Disbursement",
  completed: "Completed",
  rejected: "Rejected",
};

// which role acts at which stage
export const STAGE_ROLE: Partial<Record<LoanStage, "approver" | "finance" | "manager">> = {
  submitted: "approver",
  under_review: "approver",
  branch_approval: "approver",
  finance_approval: "finance",
  manager_approval: "manager",
};

export const nextStage = (s: LoanStage): LoanStage => {
  const i = STAGE_ORDER.indexOf(s);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : s;
};
