## Scope

This batch covers ~20 distinct items across security hardening, new admin UI, workflow changes, i18n, and email notifications. I'll group them into 5 tracks and execute in order.

---

## Track 1 — Database migration (single file)

**SECURITY DEFINER hardening**
- All `SECURITY DEFINER` functions: `SET search_path = public, pg_temp`, raise on `auth.uid() IS NULL`, reject cross-user reads unless `is_staff`. Already mostly done for `get_savings_balance`, `get_active_loan_balance`, `calculate_eligibility` — re-verify and lock down `current_policy`, `has_role`, `is_staff`, `has_board_seat`, triggers.
- `REVOKE EXECUTE ... FROM anon, public` on every public SECURITY DEFINER function; `GRANT EXECUTE ... TO authenticated` only where needed.

**Loan stage RLS — replace `loans staff update`**
- Drop the broad policy. New policy `WITH CHECK` that requires the caller's role/seat to match `OLD.stage` (mirrors `enforce_loan_transition` but at RLS level so REST writes are also blocked).

**Eligibility / type-rule enforcement**
- Trigger `trg_enforce_loan_eligibility` already exists; ensure `BEFORE INSERT OR UPDATE OF amount_requested, term_months, loan_type` and that it runs even for staff-inserted loans (skip only if admin overriding existing record).

**profiles RLS**
- Drop `profiles self update`. New `profiles self update` `WITH CHECK` that forbids changing `opening_balance`, `member_number`, `joined_at` (only admin can). Keep admin update policy.

**loan_documents mime-type lockdown**
- `ALTER TABLE loan_documents ADD CONSTRAINT loan_documents_mime_check CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp'))`.
- Trigger `BEFORE INSERT` on `storage.objects` for bucket `loan-documents` rejecting any mime not in the allow-list and any filename ending in `.svg`.

**Transaction integrity**
- `apply_repayment` already gates by `loan_id NOT NULL`. Remove dependency on `set_config('app.repayment', ...)`. Replace with: in `enforce_loan_transition`, if the only change is `outstanding_balance`/`status`/`stage→completed` driven by repayment, allow without role check by detecting `pg_trigger_depth() > 1`.
- `post_disbursement_tx` already inserts with `loan_id`. Add CHECK: `transactions.tx_type='disbursement' ⇒ loan_id NOT NULL`.

**Audit logging**
- Attach `log_audit` AFTER INSERT/UPDATE/DELETE triggers on: `loans`, `transactions`, `loan_approvals`, `loan_policies`, `user_roles`. Confirm `audit_log` already captures actor/action/entity/entity_id/meta — yes.

**Notifications dedup**
- Add unique partial index `notifications (user_id, type, link, (date_trunc('minute', created_at)))` to swallow accidental dupes. Adjust `notify_on_loan_change` to fire exactly once per `stage` OR `status` change (current implementation can fire twice when both change in same UPDATE — collapse to one INSERT using a single `IF`).
- `notify_on_tx`: add repayment branch already present; ensure deposit/contribution/repayment each fire one row. Add fee/withdrawal coverage.

**Manager disbursement-confirm**
- Add column `loans.disbursement_confirmed_at TIMESTAMPTZ` and `disbursement_confirmed_by UUID`. `enforce_loan_transition` for `disbursement → completed` requires `disbursement_confirmed_at IS NOT NULL` and caller is manager.

**Existing-loan onboarding**
- Add admin-only RPC `admin_register_existing_loan(member_id, amount, outstanding_balance, stage, loan_type, term_months)` that bypasses eligibility trigger via `SET LOCAL`-tracked admin context.

---

## Track 2 — Email infrastructure

- Run `email_domain--check_email_domain_status`. If no domain: prompt the user via `<presentation-open-email-setup>` and stop the email subtask there until they complete the dialog.
- Once a domain exists: call `setup_email_infra` then `scaffold_transactional_email`.
- Templates (in `src/lib/email-templates/`): `loan-approved`, `loan-rejected`, `loan-disbursed`. Each takes `loanNumber`, `amount`, `memberName`.
- Trigger emails from server functions (`createServerFn`) called by frontend after the relevant stage transition succeeds. Respect `notification_preferences.channel_email`.

---

## Track 3 — Frontend

1. **Admin → Loan board section** (`admin.tsx`): new card listing 3 seats (chair, member_1, member_2), `Select` of staff users to assign each. Writes to `loan_board_members`.
2. **Admin → Members table**: disable `opening_balance` input after first save (read-only badge once non-zero, edit toggle behind a confirm dialog).
3. **Admin → "Register existing loan"** dialog: member, amount, outstanding balance, stage, type, term — calls the new RPC.
4. **Approvals page**: add a "Confirm disbursement" action visible only to managers when stage = `disbursement`. Two-step: first sets `disbursement_confirmed_at`, second flips to `completed`.
5. **i18n**: add `react-i18next` + `i18next`. Two dictionaries `en.json`, `sw.json` covering nav, dashboard headings, loan stage labels, common buttons. Language switcher in `AppHeader` dropdown. Persist in `localStorage`.
6. **Loan detail / dashboard**: fix overflow on stage timeline cards (`overflow-x-auto`, `min-w-0`, wrap on `sm`).
7. **Doc upload accept attr**: confirm `application/pdf,image/jpeg,image/png,image/webp` everywhere (already done — re-verify).
8. **Input sanitization**: add `zod` schemas at every form boundary (loan apply, profile, admin transaction, board assignment, register-existing-loan). Trim, max-length, no HTML, regex member_number.

---

## Track 4 — Verification

- `supabase--linter` after migration; resolve any new warnings.
- Smoke check: try as a member to (a) update another user's `opening_balance`, (b) insert loan via REST exceeding eligibility, (c) upload SVG — all must fail.
- Verify approvals flow end-to-end: submitted → under_review → finance → board_chair → board_member_1 → board_member_2 → manager_approval → disbursement (confirm) → completed.

---

## Track 5 — Out of scope this pass

- SMS delivery (deferred until Twilio connector approved).
- Full Swahili translation of admin-only screens (this pass: nav + member-facing pages).
- 2FA already shipped in earlier pass.

---

## Order of operations

1. Submit Track 1 migration → wait for approval.
2. Regenerate types (auto).
3. Check email domain; if missing, surface setup dialog and pause email work.
4. Build Tracks 3 (frontend) in parallel where files are independent.
5. Wire emails (Track 2) once infra is ready.
6. Run linter + smoke tests.
