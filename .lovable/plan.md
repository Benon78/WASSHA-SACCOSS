# Super Admin Rollout Plan

The existing system already has a `super_admin` value in the `app_role` enum, and `has_role()` treats `super_admin` as inheriting `admin`. This plan builds a dedicated Super Admin surface on top without touching existing routing, branding, or business logic.

Given the size, I will ship this in **five sequential groups**, pausing between each for your review.

---

## Group SA1 — Foundation: schema, RLS, audit immutability

Database migration (single migration, with GRANTs + RLS on every new table):

- `permissions` — catalog of granular codes (`loan.read`, `user.create`, `audit.view`, …). Seeded.
- `role_permissions` — maps built-in `app_role` values to permission codes.
- `custom_roles` + `custom_role_permissions` + `user_custom_roles` — Super-Admin-managed custom roles.
- `branches` (`code`, `name`, `manager_id`, `status`) + `profiles.branch_id` FK.
- `user_sessions` — active device/session log (user_id, session_id, ip, user_agent, last_seen, revoked_at).
- `auth_events` — login/logout/failed-login/password-change/lockout history.
- `system_settings` (versioned key/value JSONB) for company profile, branding, templates, AI, currency, timezone.
- `backups` — backup job metadata.
- `deletion_log` — soft-delete tombstones (financial rows never physically deleted).
- Extend `audit_log` with `ip`, `user_agent`, `session_id`, `prev_value`, `new_value` (nullable, additive).
- Immutability: revoke UPDATE/DELETE on `audit_log` from all roles; block trigger even for `super_admin`. Only INSERT allowed.
- SQL helpers: `has_permission(_user, _code)`, `is_super_admin(_user)`, `soft_delete_user(_id)`, `revoke_session(_id)`.
- RLS: all admin/security tables restricted to `is_super_admin(auth.uid())` for writes; audit read gated by `has_permission('audit.view')`.

Frontend (thin): extend `src/lib/permissions.ts` with a `usePermission(code)` hook backed by a server fn that reads the union of role_permissions + custom permissions. No hardcoded gates in components.

## Group SA2 — Super Admin routes shell + Dashboard + Users

- New pathless layout `src/routes/_app/_superadmin.tsx`:
  - `beforeLoad` calls `requireSuperAdmin` server fn (server-side check, not client role only).
  - MFA gate: if `aal < aal2`, redirect to `/mfa-challenge`.
- Routes under `_superadmin/`:
  - `dashboard` — cached summary stats (members, active loans, portfolio, outstanding, repayment rate, active sessions, failed logins, DB health) via `ensureQueryData` with staleTime.
  - `users` — server-side paginated table; row actions: edit, suspend/reactivate, soft-delete, reset password, force reset, unlock, verify email, change role, assign branch, view login history. Sensitive actions require password re-auth (reauthenticate helper).
- All actions are `createServerFn` + `requireSupabaseAuth` + super-admin check + write to `audit_log` with `prev`/`new`/`ip`/`ua`/`session`.
- UI reuses existing shadcn components and design tokens.

## Group SA3 — Roles/Permissions, Branches, Loan Policies

- `roles` route: list built-in + custom roles, permission matrix editor, create/edit/delete/clone custom roles, toggle permissions. Backed by `custom_roles` tables.
- `branches` route: CRUD, assign manager, transfer members (bulk update `profiles.branch_id`), merge branches (with audit trail), disable branch (soft).
- `policies` route: wraps existing `loan_policies` with versioned edit form covering interest, limits, savings multiplier, term, penalty, grace, eligibility. Each save creates a new version row; old versions read-only.

## Group SA4 — Security Center, Audit Center, System Settings

- `security` route: failed logins, locked accounts, suspicious activity heuristic, active sessions/devices table with IP/UA, buttons to force-logout all, terminate session, lock/disable user. Sensitive ⇒ password confirmation modal.
- `audit` route: server-paginated `audit_log` viewer with filters (actor, entity, action, date range). Read-only. Export requires reauth + itself audited.
- `settings` route: tabbed form over `system_settings` (Company, Branding, Templates, AI, Language, Timezone, Currency, Backup config). Versioned writes.
- `notifications` (admin templates) — CRUD on notification templates JSONB.

## Group SA5 — Backups, Monitoring, AI Config, Hardening

- `backups` route: trigger (records job in `backups`), history table, download metadata JSON. Actual DB backup is Cloud-managed — this records intent + metadata.
- `monitoring` route: API latency (from server-fn logs sampled), DB health snapshot (via `supabase--db_health` mirrored into a server fn), storage usage, active sessions, error rates.
- `ai-config` route: model, temperature, system prompt, rate limits stored in `system_settings`.
- Hardening pass:
  - Enable `password_hibp_enabled` via `configure_auth`.
  - Password policy client validator (≥12, upper/lower/digit/symbol) on password change.
  - Session inactivity timeout hook (idle-timeout auto-signout, extends existing `_authenticated` gate).
  - Rate-limit note: backend has no primitive; we implement per-user in-app cooldowns for admin-sensitive actions only.
  - `reauthenticate({ password })` helper reused across sensitive actions.

## Technical notes

- All new tables follow the mandatory GRANT + RLS + policy block.
- Every server fn writes to `audit_log` on success; failures also logged with `error` action.
- Super Admin routes are additive under `/_app/superadmin/*` — no existing routes changed.
- Permissions read via a single `getMyPermissions` server fn cached in TanStack Query; `<Can perm="…">` component wraps UI affordances.
- Custom-role permissions are effective at query time (no cache invalidation gap on grant/revoke because RLS reads live).

## What's out of scope / caveats

- **True MFA enrollment UI**: I'll wire Supabase TOTP factors (enroll/verify/challenge routes) but SMS MFA isn't in Lovable Cloud.
- **True rate limiting**: no backend primitive; only in-app cooldowns for admin actions. Documented.
- **Physical DB backups**: Cloud-managed; this records metadata only.
- **Geolocation**: derived best-effort from IP via a public API only if you approve adding it; otherwise IP-only.

Confirm and I'll start with **Group SA1** (database + audit immutability).