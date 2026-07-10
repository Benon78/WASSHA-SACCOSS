export type LoanStage =
  | "submitted"
  | "under_review"
  | "branch_approval"
  | "finance_approval"
  | "board_chair"
  | "board_member_1"
  | "board_member_2"
  | "manager_approval"
  | "disbursement"
  | "completed"
  | "rejected";

// New canonical flow:
// Submitted → Under Review → Finance → Board Chair → Board Member 1 → Board Member 2 → Manager → Disbursement → Completed
export const STAGE_ORDER: LoanStage[] = [
  "submitted",
  "under_review",
  "finance_approval",
  "board_chair",
  "board_member_1",
  "board_member_2",
  "manager_approval",
  "disbursement",
  "completed",
];

export const STAGE_LABEL: Record<LoanStage, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  branch_approval: "Branch Approval",
  finance_approval: "Finance Review",
  board_chair: "Board Chair",
  board_member_1: "Board Member 1",
  board_member_2: "Board Member 2",
  manager_approval: "Manager Approval",
  disbursement: "Disbursement",
  completed: "Completed",
  rejected: "Rejected",
};

// Stages where standard role acts (board seats handled separately via has_board_seat)
export const STAGE_ROLE: Partial<Record<LoanStage, "approver" | "finance" | "manager">> = {
  submitted: "approver",
  under_review: "approver",
  branch_approval: "approver",
  finance_approval: "finance",
  manager_approval: "manager",
  disbursement: "manager",
};

// Stages that require a board seat instead of a generic role
export const STAGE_BOARD_SEAT: Partial<Record<LoanStage, "chair" | "member_1" | "member_2">> = {
  board_chair: "chair",
  board_member_1: "member_1",
  board_member_2: "member_2",
};

export const LOAN_TYPE_LABEL: Record<string, string> = {
  development: "Development Loan",
  chapchap: "Chap Chap (Quick) Loan",
  emergency: "Emergency Loan",
};

export const LOAN_TYPE_DESC: Record<string, string> = {
  development: "Long-term financing for business growth, education, asset acquisition, or housing.",
  chapchap: "Fast-track small loan, max TZS 200,000, repaid within 1 month.",
  emergency: "Urgent loan for medical, bereavement or other unforeseen events. Priority review.",
};

// Per-type caps (mirrors loan_type_rules in the database)
export const LOAN_TYPE_RULES: Record<string, { maxAmount: number; maxTerm: number }> = {
  chapchap: { maxAmount: 200_000, maxTerm: 1 },
  emergency: { maxAmount: 1_000_000, maxTerm: 6 },
  development: { maxAmount: 50_000_000, maxTerm: 36 },
};

export const nextStage = (s: LoanStage): LoanStage => {
  const i = STAGE_ORDER.indexOf(s);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : s;
};
