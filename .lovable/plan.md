
# WASSHA SACCOS — Major Update Plan

Grouped by track. One DB migration, then code in order.

---

## Track 1 — Database migration (single file)

**A. Savings/Loan separation (core finance fix)**
- Update `get_savings_balance`: only count `deposit`, `contribution`, `withdrawal`, `fee` — exclude `disbursement` and `repayment` entirely. Savings stays untouched by loan activity.
- Add `loan_id UUID NULL` to `transactions` (FK to `loans`). Required when `tx_type IN ('repayment','disbursement','fee')` (validation trigger).
- Update `apply_repayment` trigger: deduct from the **specific loan** (`loan_id` on tx), not "any disbursed loan".
- Update `post_disbursement_tx` trigger: stamp `loan_id` on the disbursement tx.

**B. Loan types**
- New enum `loan_type` with values `development`, `chapchap`, `emergency`.
- Add `loan_type loan_type NOT NULL DEFAULT 'development'` to `loans`.

**C. Interest rate → 13%**
- Insert new `loan_policies` version with `interest_rate = 13.0`.
- Default on `loans.interest_rate` → 13.0.

**D. Security: realtime topic policy**
- Drop the existing realtime policy and recreate WITHOUT the `OR realtime.topic() LIKE 'realtime:%'` clause. Only `user-notif-<auth.uid()>` allowed.

**E. Member-number is admin-entered**
- `handle_new_user`: stop auto-generating `member_number` (set NULL).
- Admin page exposes editable input (already partially there — make required).

**F. Notification preferences**
- New table `notification_preferences (user_id PK, channel_email bool default true, channel_sms bool default false, sms_phone text)`.
- RLS: self read/update.

**G. Audit log already exists** — just add UI.

**Note:** Items already in DB (function ownership guards, stage-transition trigger) are confirmed in current schema — no re-work needed.

---

## Track 2 — Backend / edge function

**SMS via Twilio connector** (server function or edge function):
- New edge function `send-sms` reading `TWILIO_API_KEY` (will request via secret).
- DB trigger `notify_dispatch` on `notifications` insert: if user prefs has SMS on and phone set, calls function via `pg_net` — or simpler: client-side hook subscribes and dispatches. **Simpler approach for now**: do nothing automatic; add a "Resend via SMS" + automatic call on loan-status-change notification via a Postgres trigger using `pg_net.http_post` to the edge function.
- Keep email notifications as the existing in-app notifications for now (no new email infra requested).

(Note: Will request Twilio connection if user wants to proceed with SMS.)

---

## Track 3 — Frontend changes

1. **Loan apply form**: add loan type radio (development / chapchap / emergency) with descriptions.
2. **Repayment posting (admin)**: when posting a repayment transaction, require selection of an active loan from a dropdown; persist `loan_id`.
3. **Statements page**: split into "Savings statement" (savings tx only) and "Loan repayment statement" (per-loan).
4. **Disbursement receipt PDF**: button on `/loans/$loanId` when `status='disbursed'` or `stage='completed'`. Includes loan number, amount, date, txn id (disbursement tx), full timeline of approvals.
5. **Disbursement manager approval UI**: in `/approvals`, show loans at `stage='disbursement'` to users with `manager` OR `finance` role with action "Confirm disbursement & complete" → moves to completed.
6. **Audit log page** `/admin/audit` (separate from reports): date range, action search, entity filter, CSV + PDF export.
7. **Notifications center page** `/notifications` (full-page) + bell upgrade: type filter chips, read/unread toggle, deep link via `link` field already populated.
8. **Profile**: notification preferences card (toggle SMS / email, phone for SMS).
9. **Admin members table**: `member_number` becomes required input field.
10. **Document preview dialog**: in `/loans/$loanId`, click document → modal showing image inline or embedded PDF (object/iframe with signed URL) — no new tab.
11. **Header**: add nav links for `/admin/policies`, `/admin/reports`, `/admin/audit`, `/notifications`.

---

## Tech notes

- New deps: none (already have jspdf, xlsx, qrcode).
- SMS: optional — will ask user to confirm before requesting Twilio connection.
- All admin routes guarded by `hasRole('admin')`.

---

## Order of operations
1. **DB migration** (Track 1) — requires approval.
2. Update existing triggers + types regen.
3. Frontend: loan types → repayment posting → statements → receipts → audit page → notifications page → profile prefs → doc preview → admin member-number → header links.
4. SMS (optional, if user confirms).

Confirm and I'll run the migration, then build the rest.
