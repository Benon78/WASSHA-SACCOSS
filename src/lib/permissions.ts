/**
 * Centralized authorization utilities.
 *
 * All UI-side permission decisions MUST go through here so we can evolve the
 * role model without hunting through components. Backend RLS remains the
 * source of truth — these helpers only decide what to render.
 */

export type AppRole =
  | "member"
  | "approver"
  | "finance"
  | "manager"
  | "admin"
  | "super_admin";

export type BoardSeat = "chair" | "member_1" | "member_2";

/**
 * Future-facing display roles. They map onto today's DB roles so we can add
 * new labels in the UI (e.g. Branch Officer, Board Member) without a DB
 * migration. Extend `ROLE_ALIASES` when a new label is introduced.
 */
export type DisplayRole =
  | "Member"
  | "Branch Officer"
  | "Finance Officer"
  | "Manager"
  | "Board Member"
  | "Admin"
  | "Super Admin";

const ROLE_ALIASES: Record<DisplayRole, AppRole[]> = {
  Member: ["member"],
  "Branch Officer": ["approver"],
  "Finance Officer": ["finance"],
  Manager: ["manager"],
  "Board Member": [], // board membership is tracked separately via BoardSeat
  Admin: ["admin"],
  "Super Admin": ["super_admin"],
};

/** Role hierarchy — higher numbers inherit lower numbers' UI capabilities. */
const ROLE_RANK: Record<AppRole, number> = {
  member: 0,
  approver: 10,
  finance: 20,
  manager: 30,
  admin: 90,
  super_admin: 100,
};

export const STAFF_ROLES: AppRole[] = [
  "approver",
  "finance",
  "manager",
  "admin",
  "super_admin",
];

export interface PermissionContext {
  roles: AppRole[];
  boardSeats: BoardSeat[];
}

export function hasRole(ctx: PermissionContext, role: AppRole): boolean {
  if (ctx.roles.includes(role)) return true;
  // super_admin implicitly satisfies admin checks
  if (role === "admin" && ctx.roles.includes("super_admin")) return true;
  return false;
}

export function hasAnyRole(ctx: PermissionContext, roles: AppRole[]): boolean {
  return roles.some((r) => hasRole(ctx, r));
}

export function hasMinRole(ctx: PermissionContext, min: AppRole): boolean {
  const threshold = ROLE_RANK[min];
  return ctx.roles.some((r) => ROLE_RANK[r] >= threshold);
}

export function hasBoardSeat(ctx: PermissionContext, seat: BoardSeat): boolean {
  return ctx.boardSeats.includes(seat);
}

export function isBoardMember(ctx: PermissionContext): boolean {
  return ctx.boardSeats.length > 0;
}

export function isStaff(ctx: PermissionContext): boolean {
  return hasAnyRole(ctx, STAFF_ROLES) || isBoardMember(ctx);
}

export function displayRoles(ctx: PermissionContext): DisplayRole[] {
  const out: DisplayRole[] = [];
  (Object.keys(ROLE_ALIASES) as DisplayRole[]).forEach((label) => {
    const backing = ROLE_ALIASES[label];
    if (label === "Board Member") {
      if (isBoardMember(ctx)) out.push(label);
      return;
    }
    if (backing.some((r) => ctx.roles.includes(r))) out.push(label);
  });
  return out;
}

/**
 * Domain-level permissions. Keep this list tight; add entries as new
 * protected UI surfaces appear so route/component code never re-derives
 * role logic.
 */
export type Permission =
  | "loans.approve"
  | "loans.disburse"
  | "loans.register_existing"
  | "members.manage"
  | "policies.manage"
  | "reports.view"
  | "audit.view"
  | "escalations.manage"
  | "board.act";

const PERMISSION_MATRIX: Record<Permission, (ctx: PermissionContext) => boolean> = {
  "loans.approve": (ctx) => hasAnyRole(ctx, ["approver", "finance", "manager", "admin", "super_admin"]) || isBoardMember(ctx),
  "loans.disburse": (ctx) => hasAnyRole(ctx, ["manager", "admin", "super_admin"]),
  "loans.register_existing": (ctx) => hasAnyRole(ctx, ["admin", "super_admin"]),
  "members.manage": (ctx) => hasAnyRole(ctx, ["admin", "super_admin"]),
  "policies.manage": (ctx) => hasAnyRole(ctx, ["admin", "super_admin"]),
  "reports.view": (ctx) => hasAnyRole(ctx, ["finance", "manager", "admin", "super_admin"]),
  "audit.view": (ctx) => hasAnyRole(ctx, ["admin", "super_admin"]),
  "escalations.manage": (ctx) => hasAnyRole(ctx, ["admin", "super_admin"]),
  "board.act": (ctx) => isBoardMember(ctx) || hasAnyRole(ctx, ["admin", "super_admin"]),
};

export function can(ctx: PermissionContext, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission](ctx);
}
