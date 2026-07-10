// Translates raw Supabase / Postgres errors into user-friendly messages.
// Use `friendlyError(err)` before passing to `toast.error(...)`.

type AnyErr = { message?: string; code?: string; details?: string } | string | null | undefined;

const RULES: Array<[RegExp, string]> = [
  [
    /act on your own loan application/i,
    "You can't act on your own loan application — ask another officer to review it.",
  ],
  [
    /do not have authority for stage/i,
    "You don't have the required role for this stage of the loan.",
  ],
  [
    /cannot be marked completed while outstanding/i,
    "This loan still has an outstanding balance. It will complete automatically once fully repaid.",
  ],
  [
    /cannot be marked completed while fee/i,
    "This loan still has a fee balance. It will complete automatically once fully paid.",
  ],
  [/loan_id required/i, "Please pick which loan this transaction applies to."],
  [/exceeds max/i, "The amount or term exceeds the limit set for this loan type."],
  [/exceeds your limit/i, "The requested amount exceeds your current borrowing limit."],
  [/not eligible/i, "You're not currently eligible. Check your dashboard for the reasons."],
  [/only apply for your own account/i, "You can only apply for a loan on your own account."],
  [/only admins may change/i, "That field can only be changed by an admin."],
  [
    /Cannot remove the last admin/i,
    "You can't remove the last admin — assign another admin first.",
  ],
  [/duplicate key value/i, "That value already exists. Please choose a different one."],
  [
    /SVG uploads are not permitted/i,
    "SVG files aren't allowed. Please upload a PDF, JPG, PNG, or WebP.",
  ],
  [
    /row-level security|permission denied|not authorized|forbidden/i,
    "You don't have permission to do that.",
  ],
  [
    /infinite recursion detected in policy/i,
    "Something in access control went wrong on our side. Please refresh and try again.",
  ],
  [
    /violates check constraint/i,
    "One of the values you entered isn't valid. Please review the form.",
  ],
  [
    /network|fetch failed|failed to fetch/i,
    "Network issue — please check your connection and try again.",
  ],
  [/Loan .* not found/i, "We couldn't find that loan."],
];

export function friendlyError(
  err: AnyErr,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  const msg = typeof err === "string" ? err : (err.message ?? err.details ?? "");
  if (!msg) return fallback;
  for (const [re, friendly] of RULES) {
    if (re.test(msg)) return friendly;
  }
  // Trim trailing hint noise
  const cleaned = msg.replace(/^(new row violates|permission denied for|error:)\s*/i, "").trim();
  return cleaned.length > 140 ? fallback : cleaned;
}
