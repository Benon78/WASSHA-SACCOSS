# WASSHA SACCOS — Security Hardening + New Modules

Splitting the work into 4 tracks. Each track is shippable on its own; I'll execute them in this order so security lands first.

---

## Track 1 — Security hardening (DB migration)

One migration that fixes every reported issue:

1. **Function leakage** — `get_savings_balance`, `get_active_loan_balance`, `calculate_eligibility`
   - Add internal guard: `if _user_id <> auth.uid() and not is_staff(auth.uid()) then raise exception 'forbidden'`.
   - `REVOKE EXECUTE ... FROM anon` on these three + `has_role`, `is_staff`.
   - Keep `SECURITY DEFINER` (needed to read `user_roles`) but tighten `search_path` and grants.

2. **Realtime channel isolation** — enable RLS on `realtime.messages`, add policy that only allows topics matching `notif-<auth.uid()>`. Update `NotificationsBell` to subscribe on that topic name.

3. **Loan stage transition enforcement** — replace the open `loans staff update` policy with a `BEFORE UPDATE` trigger `enforce_loan_transition()` that checks:
   - Only the role assigned to the current stage (`STAGE_ROLE`) can advance it.
   - Stage can only move to the immediate next stage, to `rejected`, or stay put.
   - `status` transitions validated (pending → approved/rejected; approved → disbursed → completed).
   - `disbursement → completed` requires `finance` role (records the disbursement, then closes).

4. **Storage policies** — add UPDATE + DELETE policies on `storage.objects` for bucket `loan-documents`, scoped to `is_staff(auth.uid())` OR folder owner (`auth.uid()::text = (storage.foldername(name))[1]`).

5. **Admin lockout protection**
   - Trigger `protect_last_admin()` on `user_roles` BEFORE DELETE/UPDATE — block if it would leave zero admins.
   - Tighten `roles admin insert` policy: still requires admin, but document the risk; add audit log row on every change.

6. **Audit log table** — `public.audit_log(id, actor_id, action, entity, entity_id, meta jsonb, created_at)` with RLS (admin-read only). Triggers populate it for: `user_roles` changes, `loans` updates, `loan_policies` changes, `transactions` inserts.

---

## Track 2 — Loan workflow completion

7. **Disbursement → Completed action**
   - In `/loans/$loanId`, when `stage='disbursement'` and viewer has `finance` role: button **"Record disbursement"** → posts a `disbursement` transaction (new tx_type) and moves stage to `completed` + `status='disbursed'`.
   - When `stage='completed'`, automated repayments tracked via `transactions.tx_type='repayment'`; loan flips to `status='completed'` when `outstanding_balance <= 0` (trigger).
   - Adds the missing tx_type `disbursement` enum value.

8. **Loan policy table** — `public.loan_policies(id, version, interest_rate, min_savings, savings_multiplier, min_membership_months, max_term_months, effective_from, created_by)`.
   - `calculate_eligibility` reads the latest active policy.
   - Admin page `/admin/policies` lists versions, lets admin create a new version (immutable history).

---

## Track 3 — Member & admin features

9. **2FA (TOTP)** in `/profile`
   - Use Supabase Auth's built-in MFA: `supabase.auth.mfa.enroll({ factorType: 'totp' })`, show QR, verify, list factors, allow unenroll.
   - New route `/profile` (under `_app`) with: name/phone edit, **Two-factor authentication** card, member number display.

10. **Admin: edit member join date** — on `/admin`, add an editable `joined_at` field per member (date input, saves to `profiles.joined_at`).

11. **PDF statements** — client-side generation with `jspdf` + `jspdf-autotable`:
    - Member: `/statements` page → date range picker → "Download savings statement" + "Download loan repayment statement" → branded PDF.
    - Per-loan: button on `/loans/$loanId` to download repayment schedule PDF.

12. **Admin reporting center** — `/admin/reports`
    - Filters: date range, type (loans / contributions / audit log), status.
    - Export buttons: **CSV** (native), **Excel** (`xlsx` library), **PDF** (`jspdf-autotable`).

---

## Track 4 — UI polish

13. **Hero fixes** on `/`
    - Remove "Request demo" button.
    - Fix white-on-white text by ensuring hero copy uses tokens with proper contrast on the gradient background.

14. **Workflow guide** — new public route `/workflow` with a visual end-to-end guide (member apply → approver → finance → manager → disbursement → completion), responsibilities per role, and SLA expectations. Linked from header + landing page.

---

## Tech notes

- New deps: `jspdf`, `jspdf-autotable`, `xlsx`, `qrcode`.
- Realtime subscription rename: channel `notif-<uid>` → topic `user-notif-<uid>` so the realtime RLS policy can pattern-match cleanly.
- All new admin routes guarded by `hasRole('admin')`; reports restricted to admin + manager.
- No edge functions — everything either DB triggers or client code under existing RLS.

---

## Order of operations

1. Migration (Track 1 + tables for Track 2/3) — single SQL file, requires approval.
2. After approval: install deps, then build code in this order: security-related client changes → loan workflow → policies admin → profile/2FA → statements → reports → UI polish.

Confirm and I'll run the migration.
