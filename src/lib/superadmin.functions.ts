/**
 * Super Admin server functions.
 *
 * Every mutation:
 *   - runs through requireSuperAdmin (server-side role gate)
 *   - re-verifies the caller's password for sensitive actions
 *   - writes to audit_log with prev/new values, IP, user-agent, session id
 *
 * The audit_log table is immutable (UPDATE/DELETE revoked + trigger),
 * so once a record lands it stays forever.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperAdmin } from "@/integrations/supabase/require-superadmin";

// ------------ helpers ------------

async function verifyCallerPassword(email: string, password: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  // Throwaway client — no session persistence, no side-effects on the caller's session.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Response("Password verification failed", { status: 401 });
}

type AuditArgs = {
  action: string;
  entity: string;
  entityId: string | null;
  prev?: unknown;
  next?: unknown;
  summary: string;
  actorId: string;
  meta: { ip: string | null; ua: string | null; sid: string | null };
};

async function writeAudit(a: AuditArgs) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    actor_id: a.actorId,
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId,
    ip: a.meta.ip,
    user_agent: a.meta.ua,
    session_id: a.meta.sid,
    prev_value: (a.prev ?? null) as never,
    new_value: (a.next ?? null) as never,
    meta: { summary: a.summary, source: "superadmin" } as never,
  });
}

// ------------ dashboard ------------

export const getSuperAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      members,
      activeLoans,
      portfolio,
      outstanding,
      completedLoans,
      failedLogins24h,
      activeSessions,
      auditAlerts,
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("loans")
        .select("*", { count: "exact", head: true })
        .in("status", ["approved", "disbursed"]),
      supabaseAdmin.rpc("get_portfolio_totals" as never).then(
        (r) => r,
        () => ({ data: null }),
      ),
      supabaseAdmin
        .from("loans")
        .select("outstanding_balance")
        .in("status", ["approved", "disbursed"]),
      supabaseAdmin
        .from("loans")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed"),
      supabaseAdmin
        .from("auth_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "failed_login")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabaseAdmin
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .is("revoked_at", null)
        .gte("last_seen", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabaseAdmin
        .from("audit_log")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    ]);

    const portfolioTotal = (outstanding.data ?? []).reduce(
      (acc, r) => acc + Number(r.outstanding_balance ?? 0),
      0,
    );

    return {
      totalMembers: members.count ?? 0,
      activeLoans: activeLoans.count ?? 0,
      portfolioOutstanding: portfolioTotal,
      completedLoans: completedLoans.count ?? 0,
      failedLogins24h: failedLogins24h.count ?? 0,
      activeSessions: activeSessions.count ?? 0,
      auditEvents24h: auditAlerts.count ?? 0,
      portfolioRepaymentRate:
        (completedLoans.count ?? 0) + (activeLoans.count ?? 0) > 0
          ? ((completedLoans.count ?? 0) /
              ((completedLoans.count ?? 0) + (activeLoans.count ?? 0))) *
            100
          : 0,
    };
  });

// ------------ users: paginated list ------------

const listUsersInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "suspended", "deleted"]).default("active"),
});

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => listUsersInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("profiles")
      .select(
        "user_id, full_name, member_number, phone, joined_at, branch_id, suspended_at, deleted_at, created_at",
        {
          count: "exact",
        },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.status === "active") q = q.is("suspended_at", null).is("deleted_at", null);
    else if (data.status === "suspended")
      q = q.not("suspended_at", "is", null).is("deleted_at", null);
    else if (data.status === "deleted") q = q.not("deleted_at", "is", null);

    if (data.search) {
      q = q.or(
        `full_name.ilike.%${data.search}%,member_number.ilike.%${data.search}%,phone.ilike.%${data.search}%`,
      );
    }

    const { data: profiles, count, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });

    // Load roles for these users
    const ids = (profiles ?? []).map((p) => p.user_id);
    const [rolesRes, branchesRes] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
        : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
      supabaseAdmin.from("branches").select("id, name, code"),
    ]);
    const roleMap = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    }
    const branchMap = new Map<string, { name: string; code: string }>();
    for (const b of branchesRes.data ?? []) branchMap.set(b.id, { name: b.name, code: b.code });

    const rows = (profiles ?? []).map((p) => ({
      ...p,
      roles: roleMap.get(p.user_id) ?? [],
      branch: p.branch_id ? (branchMap.get(p.branch_id) ?? null) : null,
    }));

    return { rows, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

// ------------ users: single detail + login history ------------

const idInput = z.object({ userId: z.string().uuid() });

export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, roles, sessions, events, authUser] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("user_sessions")
        .select("*")
        .eq("user_id", data.userId)
        .order("last_seen", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("auth_events")
        .select("*")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.auth.admin.getUserById(data.userId),
    ]);
    return {
      profile: profile.data,
      roles: (roles.data ?? []).map((r) => r.role),
      sessions: (sessions.data ?? []).map((s) => ({
        id: s.id,
        session_id: s.session_id,
        ip: s.ip == null ? null : String(s.ip),
        user_agent: s.user_agent,
        device: s.device,
        browser: s.browser,
        os: s.os,
        location: s.location,
        last_seen: s.last_seen,
        revoked_at: s.revoked_at,
        created_at: s.created_at,
      })),
      events: (events.data ?? []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        ip: e.ip == null ? null : String(e.ip),
        user_agent: e.user_agent,
        session_id: e.session_id,
        email: e.email,
        created_at: e.created_at,
      })),
      email: authUser.data.user?.email ?? null,
      emailConfirmedAt: authUser.data.user?.email_confirmed_at ?? null,
      lastSignInAt: authUser.data.user?.last_sign_in_at ?? null,
      bannedUntil:
        (authUser.data.user as unknown as { banned_until?: string | null })?.banned_until ?? null,
    };
  });

// ------------ password reauthentication (probe only) ------------

const reauthInput = z.object({ password: z.string().min(1).max(128) });

export const reauthenticate = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => reauthInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser.user?.email;
    if (!email) throw new Response("Account has no email on file", { status: 400 });
    await verifyCallerPassword(email, data.password);
    return { ok: true, verifiedAt: new Date().toISOString() };
  });

// ------------ sensitive user actions ------------

const sensitiveBase = {
  userId: z.string().uuid(),
  password: z.string().min(1).max(128),
};

// suspend
export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ ...sensitiveBase, reason: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("suspended_at, suspended_reason")
      .eq("user_id", data.userId)
      .maybeSingle();

    const patch = { suspended_at: new Date().toISOString(), suspended_reason: data.reason };
    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Response(error.message, { status: 500 });
    if (!updated || updated.length === 0)
      throw new Response("No profile row was updated. The user may not exist.", { status: 404 });
    // Also ban in Supabase Auth so tokens can't refresh.
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "876000h",
    } as never);

    await writeAudit({
      action: "user.suspend",
      entity: "profiles",
      entityId: data.userId,
      prev,
      next: patch,
      summary: `Suspended user ${data.userId}: ${data.reason}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// reactivate
export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => z.object(sensitiveBase).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("suspended_at, suspended_reason")
      .eq("user_id", data.userId)
      .maybeSingle();

    const patch = { suspended_at: null, suspended_reason: null };
    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Response(error.message, { status: 500 });
    if (!updated || updated.length === 0)
      throw new Response("No profile row was updated. The user may not exist.", { status: 404 });
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" } as never);

    await writeAudit({
      action: "user.reactivate",
      entity: "profiles",
      entityId: data.userId,
      prev,
      next: patch,
      summary: `Reactivated user ${data.userId}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// soft delete
export const softDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ ...sensitiveBase, reason: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);
    if (data.userId === context.userId) {
      throw new Response("You cannot delete your own super admin account.", { status: 400 });
    }

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: now, suspended_at: now, suspended_reason: data.reason })
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Response(error.message, { status: 500 });
    if (!updated || updated.length === 0)
      throw new Response("No profile row was updated. The user may not exist.", { status: 404 });
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "876000h",
    } as never);
    await supabaseAdmin.from("deletion_log").insert({
      entity: "profiles",
      entity_id: data.userId,
      actor_id: context.userId,
      reason: data.reason,
      snapshot: prev as never,
    });

    await writeAudit({
      action: "user.soft_delete",
      entity: "profiles",
      entityId: data.userId,
      prev,
      next: { deleted_at: now },
      summary: `Soft-deleted user ${data.userId}: ${data.reason}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// send password reset email
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => z.object(sensitiveBase).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = target.user?.email;
    if (!email) throw new Response("User has no email on file", { status: 400 });

    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) throw new Response(error.message, { status: 500 });

    await writeAudit({
      action: "user.send_password_reset",
      entity: "auth.users",
      entityId: data.userId,
      summary: `Sent password reset link to ${email}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// unlock (clear ban)
export const unlockUser = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => z.object(sensitiveBase).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "none",
    } as never);
    if (error) throw new Response(error.message, { status: 500 });

    await writeAudit({
      action: "user.unlock",
      entity: "auth.users",
      entityId: data.userId,
      summary: `Unlocked user ${data.userId}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// mark email verified
export const verifyEmail = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => z.object(sensitiveBase).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    } as never);
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit({
      action: "user.email_verified",
      entity: "auth.users",
      entityId: data.userId,
      summary: `Marked email verified for user ${data.userId}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// change role
const APP_ROLES = ["member", "approver", "finance", "manager", "admin", "super_admin"] as const;
export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) =>
    z
      .object({ ...sensitiveBase, role: z.enum(APP_ROLES), replaceAll: z.boolean().default(true) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { data: prev } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    if (data.replaceAll) {
      const { error: delErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId);
      if (delErr) throw new Response(delErr.message, { status: 500 });
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" })
      .select("user_id");
    if (error) throw new Response(error.message, { status: 500 });
    if (!inserted || inserted.length === 0) {
      throw new Response("Role change did not persist. Check database permissions.", {
        status: 500,
      });
    }

    await writeAudit({
      action: "user.change_role",
      entity: "user_roles",
      entityId: data.userId,
      prev,
      next: { role: data.role },
      summary: `Changed role of user ${data.userId} to ${data.role}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// remove a single role from user_roles
export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ ...sensitiveBase, role: z.enum(APP_ROLES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    if (data.userId === context.userId && (data.role === "admin" || data.role === "super_admin")) {
      throw new Response("You cannot remove your own Admin or Super Admin role.", { status: 400 });
    }

    const { data: prev } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    const { data: deleted, error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role)
      .select("id");
    if (error) throw new Response(error.message, { status: 400 });
    if (!deleted || deleted.length === 0) {
      throw new Response(`Role "${data.role}" was not found on this user (nothing to remove).`, {
        status: 404,
      });
    }

    await writeAudit({
      action: "user.remove_role",
      entity: "user_roles",
      entityId: data.userId,
      prev,
      next: { removed: data.role },
      summary: `Removed role ${data.role} from user ${data.userId}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// assign branch
export const assignBranch = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ ...sensitiveBase, branchId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("branch_id")
      .eq("user_id", data.userId)
      .maybeSingle();

    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update({ branch_id: data.branchId })
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Response(error.message, { status: 500 });
    if (!updated || updated.length === 0)
      throw new Response("No profile row was updated. The user may not exist.", { status: 404 });

    await writeAudit({
      action: "user.assign_branch",
      entity: "profiles",
      entityId: data.userId,
      prev,
      next: { branch_id: data.branchId },
      summary: `Assigned user ${data.userId} to branch ${data.branchId ?? "(none)"}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// force sign-out (revoke all sessions for a user)
export const forceSignOutUser = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator((input: unknown) => z.object(sensitiveBase).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await verifyCallerPassword(authUser.user!.email!, data.password);

    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, "global" as never);
    if (error) throw new Response(error.message, { status: 500 });

    await supabaseAdmin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("user_id", data.userId)
      .is("revoked_at", null);

    await writeAudit({
      action: "user.force_signout",
      entity: "auth.users",
      entityId: data.userId,
      summary: `Force-signed-out all sessions for user ${data.userId}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });
