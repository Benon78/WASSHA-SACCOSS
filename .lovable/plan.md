This is a large multi-track request. I'll group it into 6 work streams and ship them in this order.

## 1. Database security hardening (one migration)

- **`profiles` column lock**: drop the broad `profiles self update` policy and replace with a policy whose `WITH CHECK` asserts the member cannot change `opening_balance`, `member_number`, or `joined_at` (admin policy stays). The existing `guard_profile_self_update` trigger is the backstop.
- **`admin_register_existing_loan` validation**: rewrite to validate (a) `_member_id` exists in `profiles`, (b) member is not staff/admin acting on themselves, (c) `_amount > 0`, `_outstanding >= 0`, `_outstanding <= _amount`, (d) `_stage in ('disbursement','completed')`, (e) `_term_months` within `loan_type_rules.max_term_months`, (f) `_amount <= loan_type_rules.max_amount`. Raise `sqlstate '22023'` with field-tagged messages (`field=amount; ...`) so the UI can map them.
- **`loan_approvals` insert policy**: require `stage = loans.stage` for the referenced loan AND that the actor's role matches the stage (approver/finance/board seat/manager) — same matrix as `enforce_loan_transition`.
- **Loans staff update policy**: tighten so admins still bypass, but non-admins must keep `member_id`, `loan_number`, `amount_requested`, `disbursement_confirmed_by` immutable via a `BEFORE UPDATE` trigger `guard_loan_field_writes` that also blocks stage skips (the existing transition trigger already enforces order — extend it to reject same-actor updates that change non-stage financial columns).
- **Audit log enrichment**: replace generic `log_audit` with a function that resolves `actor_id → profiles.full_name`/member_number and writes structured `meta` with `actor_name`, and for each entity type (`transactions`, `loans`, `loan_approvals`, `profiles`, `user_roles`, `loan_proxies`, `loan_board_members`) a friendly `summary` string ("Approver Jane Doe moved LN-123456 to finance_approval", "Member John deposited TZS 50,000", "Admin Alice granted board_chair seat to …"). Add triggers on the missing tables (`loan_proxies`, `loan_board_members`, `loan_approvals`) so proxy grants/revokes/uses and board seat changes are audited.
- **Proxy revoke audit**: add `revoked_at`, `revoked_by` columns to `loan_proxies` and update the board page to soft-revoke (UPDATE) instead of DELETE so the audit trigger captures the action with a reason.
- **Realtime topic policies**: add `realtime.messages` SELECT policies scoping `loan:<loan_id>` and `tx:<user_id>` topics to the owner or staff. (Existing `loans`/`transactions` publication stays; this just locks down broadcast channels.)

## 2. Admin board realtime + proxy revoke flow

- `src/routes/_app/admin.board.tsx`: subscribe to `loans`, `loan_proxies`, `loan_board_members` channels and refetch on changes. Replace the "delete proxy" button with a "Revoke" action that prompts for a reason and updates `revoked_at`/`revoked_by`.

## 3. Approvals UX

- `src/routes/_app/loans/$loanId.tsx` + `src/routes/_app/approvals.tsx`: hide the approve/advance dialog whenever the current viewer would act on their own loan (`loan.member_id === user.id`) — applies to board seats too. Show a muted "conflict of interest — assign a proxy" notice instead.

## 4. SEO + accessibility pass

- `src/routes/__root.tsx`: fix root title typo, remove the sitewide canonical link (TanStack concatenates links), keep only sitewide `og:type`, `og:site_name`, viewport, JSON-LD Organization. Add `og:url` per route via the route's `head()`.
- Add per-route `head()` with unique `title`, `description`, `og:title`, `og:description`, `og:url`, and leaf `canonical` for: `/`, `/workflow`, `/auth`, `/dashboard`, `/loans`, `/loans/apply`, `/notifications`, `/profile`, `/statements`, `/approvals`, `/admin` (and its children).
- Extend `src/routes/sitemap[.]xml.ts` entries with `/dashboard`, `/loans`, `/notifications`, `/profile`, `/statements`, `/approvals` (still excludes `/admin`). Update `public/robots.txt` accordingly.
- Wrap the app shell in `<main>` (in `__root.tsx`) once; remove any duplicate `<main>` in child routes.
- Fix heading order on dashboards (`h1` → `h2` → `h3`, no skips). Audit `admin.index`, `admin.board`, `loans/$loanId`, `statements`, `notifications`.
- Add `aria-label` to all icon-only buttons (notifications bell, language switcher, table action buttons).
- Replace low-contrast `text-muted-foreground/50` and arbitrary gray classes with token-based `text-muted-foreground`.

## 5. i18n completion + persistence

- `src/lib/i18n.tsx`: persist selected language in `localStorage` (`wassha.lang`) and hydrate on init. Add missing keys for nav (`approvals`, `notifications`, `profile`, `statements`, `admin`, `board_members`, `policies`, `reports`, `audit`), form labels (`amount`, `purpose`, `term_months`, `loan_type`, `submit`, `upload_documents`), and approval actions (`approve`, `request_docs`, `reject`, `confirm_disbursement`, `revoke`, `grant_proxy`).
- Apply `t(...)` to remaining hardcoded labels in `AppHeader`, `admin.*`, `loans/*`, `approvals`, `notifications`, `profile`, `statements`.

## 6. Charts — contributions/deposits + repayment trend

- New `src/components/ContributionsBarChart.tsx`: monthly bar chart (last 12 months) splitting `deposit` vs `contribution` for a given `user_id`. Use Recharts (already in project).
- New `src/components/RepaymentTrendChart.tsx`: line chart of monthly repayment totals; supports `mode="member" | "admin"` (member sees own, admin sees aggregate).
- Wire into `src/routes/_app/dashboard.tsx` (member view) and `src/routes/_app/admin.index.tsx` (admin aggregate).

## Out of scope for this batch

- **Google Search Console connection** — that's an external account action the user must do themselves in GSC. I'll add a one-liner in `llms.txt`/README noting the sitemap URL to submit, but I cannot connect it from code.
- **`get_savings_balance` / `get_active_loan_balance` / `calculate_eligibility` guards, SVG upload block, eligibility-on-insert trigger, anon EXECUTE revokes** — these are already implemented in prior migrations (see `db-functions` in context: each function already has `IF _user_id <> auth.uid() AND NOT is_staff(auth.uid()) THEN RAISE EXCEPTION`; `enforce_loan_eligibility` trigger exists; `guard_loan_doc_upload` blocks SVG). I'll re-verify via `supabase--linter` and mark the SEO/security findings fixed rather than rewriting working code.

## Technical notes

- All new SQL goes in a single migration with `SET search_path = public, pg_temp` on every function and explicit `REVOKE EXECUTE ... FROM anon` on any new SECURITY DEFINER fn.
- Audit summary strings are computed inside the trigger by joining `profiles` / `loans` — no client involvement.
- Realtime topic policies use `realtime.topic()` matching `^loan:` / `^tx:` patterns.

Ready to start with the migration (step 1) on approval.