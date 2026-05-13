
# WASSHA SACCOS — Major Update Plan (v3)

This plan groups 18 requested items into 4 tracks. **Track 1 is a single DB migration** that needs your approval; everything else is code.

---

## Track 1 — Database migration (one file)

### A. Security hardening (RLS + RPC)
1. **RPC owner-guards** — `get_savings_balance`, `get_active_loan_balance`, `calculate_eligibility` already have `auth.uid()` guards (re-confirmed in current schema). I'll harden them to `RAISE EXCEPTION 'forbidden'` (no silent NULL) and revoke `EXECUTE` from `anon`.
2. **Loan stage-transition RLS** — replace `loans staff update` with a stricter policy: only allow update when caller has the role required for `OLD.stage` (already in `enforce_loan_transition` trigger; promote to RLS USING/WITH CHECK so REST direct calls cannot stage-skip).
3. **Server-side eligibility enforcement** — new `BEFORE INSERT` trigger on `loans`: calls `calculate_eligibility(member_id)`, rejects when `eligible=false` OR `amount_requested > max_amount`. Also enforces chap-chap caps (see C).
4. **Transactions integrity** — replace `tx staff insert` with WITH CHECK that requires the target `user_id` exists in `profiles`, and when `loan_id` is set, the loan belongs to that user.
5. **`loan_policies` lock-down** — add explicit `UPDATE`/`DELETE` policies = admin-only (deny by default for non-admins; explicit makes it future-proof).

### B. New approval workflow
New `loan_stage` enum values:
`submitted → under_review → finance_review → board_chair → board_member_1 → board_member_2 → manager_approval → disbursement → completed` (+ `rejected`).

- New `app_role` values: `board_chair`, `board_member`. (Existing roles kept.)
- New table `loan_board_members(user_id, seat 'chair'|'member_1'|'member_2', assigned_at, assigned_by)` — unique on `seat`. Admin-managed.
- Update `enforce_loan_transition` to require:
  - `finance_review` → `finance`
  - `board_chair` → user with `loan_board_members.seat='chair'`
  - `board_member_1` → seat `member_1`
  - `board_member_2` → seat `member_2`
  - `manager_approval` → `manager`
  - `disbursement` → `manager`
- **Disbursement no longer auto-completes status** — at `disbursement`→`completed` stage transition, set `loans.status='disbursed'` AND keep status as `disbursed` until `outstanding_balance` reaches 0. Only then `apply_repayment` flips status to `completed` (it already does this — confirmed). Remove any logic that blocks updating a `completed` loan: enforce that completion is reached only via repayments.

### C. Loan-type rules
- New table `loan_type_rules(loan_type PK, max_amount, max_term_months)`.
- Seed: `chapchap` → max 200,000 TZS, 1 month; `emergency` → 1,000,000 / 6 months; `development` → use policy multiplier / 36 months.
- Eligibility trigger enforces these caps.

### D. Notification preferences → triggers
- Existing `notification_preferences` extended with `notify_on_transaction bool default true`.
- Create `dispatch_notification_email()` trigger function that fires on `notifications` INSERT and, when user prefs.channel_email=true, calls edge function `send-email` via `pg_net.http_post`. (Edge function added in Track 3.)

### E. Member opening balance
- New column `profiles.opening_balance numeric NOT NULL DEFAULT 0` (admin-editable).
- `get_savings_balance` returns `opening_balance + sum(...)`.
- Statements include opening balance in PDF header.

---

## Track 2 — Edge functions

- `send-email` — uses Resend (will need RESEND_API_KEY; will request via `add_secret` only after you approve track 1). Sends a basic HTML notification email.
- (SMS deferred — not in this round to keep scope.)

---

## Track 3 — Frontend changes

### Security & UX fixes
1. **Document upload** — restrict accept to `application/pdf,image/jpeg,image/png,image/webp` (drop SVG and `image/*` wildcard). Validate MIME+extension in `loans/apply.tsx` and `loans/$loanId.tsx`. Block uploads when `loan.stage='disbursement'` or later.
2. **Statements** — new "Per-loan repayment + disbursement statement" with **date-range filter** (already partially there; add date range to loan PDF, include disbursement transaction row, opening balance line).
3. **Notification auto-mark-read on link click** — already wired; add **realtime sync** so bell + `/notifications` update when a row's `read` changes (subscribe to UPDATE events on user's notifications channel).
4. **Notifications page pagination** — replace single scroll with page size 20 + Prev/Next.
5. **Dashboard** — remove the loan-stage timeline from the main dashboard; only show it inside `/loans/$loanId`.

### Workflow & admin
6. **Approvals page** — new stages surface for board chair / board members / manager / disbursement; each only sees the queue matching their role/seat.
7. **Admin → Loan board** — new section on `/admin` to assign 3 users to seats (chair, member_1, member_2). Picker reads from staff users.
8. **Admin → Member opening balance** — editable input on the members table.
9. **Apply form** — show chap-chap cap (200k / 1 month) inline; clamp inputs.

### Mobile & i18n
10. **AppHeader** — add hamburger drawer (Sheet) for mobile nav covering all role-aware links.
11. **Pages audited for mobile**: dashboard, loans index, loan detail, approvals, admin tabs, statements, notifications — fix overflow with responsive grids and table → card switch under `md`.
12. **i18n** — add `react-i18next` with English + Swahili dictionaries. Language switcher in header dropdown. Translate primary strings (header, nav, dashboard cards, auth, loan apply, notifications). Stretch goal: not every admin-only page in this pass; clearly noted.

---

## Track 4 — Verification
- Run Supabase linter after migration.
- Smoke-check: log in as member, attempt to fetch another user's `get_savings_balance` (should fail), attempt to advance a loan past your role (should fail), upload an SVG (rejected client + accept attribute).

---

## Order
1. Approve migration → run Track 1.
2. Regenerate types, build edge function (if you want email — say yes/no).
3. Build frontend in order listed.
4. Add i18n last (touches many files).

## Notes / explicit out-of-scope
- SMS delivery — deferred (no Twilio yet).
- Full translation of every admin/report screen — only key user-facing screens this pass.
- Existing pending loans are **not** auto-migrated to new stages; admin must move them once. (Old stage values preserved in enum.)

Confirm and I'll run the migration, then ship the rest.
