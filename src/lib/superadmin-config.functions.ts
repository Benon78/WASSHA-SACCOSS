/**
 * Super Admin — Configuration server functions.
 *
 * Covers:
 *   - Custom roles (CRUD + permission matrix + built-in role permission grants)
 *   - Branches (CRUD + member reassignment + soft-disable + merge)
 *   - Loan policies (versioned publish; old versions immutable at the app layer)
 *
 * All mutations:
 *   - gated by requireSuperAdmin
 *   - re-verify caller password for destructive changes
 *   - write to the immutable audit_log with prev/new values
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSuperAdmin } from "@/integrations/supabase/require-superadmin";

// --------------- shared helpers (kept local — not exported to reduce surface)

async function verifyCallerPassword(email: string, password: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Response("Password verification failed", { status: 401 });
}

type Meta = { ip: string | null; ua: string | null; sid: string | null };
async function writeAudit(a: {
  action: string;
  entity: string;
  entityId: string | null;
  prev?: unknown;
  next?: unknown;
  summary: string;
  actorId: string;
  meta: Meta;
}) {
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

async function assertCallerPassword(callerId: string, password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(callerId);
  if (!authUser.user?.email) throw new Response("Account has no email on file", { status: 400 });
  await verifyCallerPassword(authUser.user.email, password);
}

// =====================================================================
// ROLES & PERMISSIONS
// =====================================================================

/** Public catalog — any signed-in user may read to render permission-aware UI. */
export const getPermissionCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permissions")
      .select("code, description, category")
      .order("category")
      .order("code");
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });

/** Full picture for the admin screen: built-in matrix + custom roles + their permissions. */
export const getRolesOverview = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [perms, builtIn, customRoles, customPerms, userRoles, userCustom] = await Promise.all([
      supabaseAdmin.from("permissions").select("code, description, category").order("category").order("code"),
      supabaseAdmin.from("role_permissions").select("role, permission_code"),
      supabaseAdmin.from("custom_roles").select("id, name, description, is_active, created_at").order("name"),
      supabaseAdmin.from("custom_role_permissions").select("custom_role_id, permission_code"),
      supabaseAdmin.from("user_roles").select("role"),
      supabaseAdmin.from("user_custom_roles").select("custom_role_id"),
    ]);

    const builtInMatrix: Record<string, string[]> = {};
    for (const r of builtIn.data ?? []) {
      (builtInMatrix[r.role] ??= []).push(r.permission_code);
    }
    const customMatrix: Record<string, string[]> = {};
    for (const r of customPerms.data ?? []) {
      (customMatrix[r.custom_role_id] ??= []).push(r.permission_code);
    }
    const builtInCounts: Record<string, number> = {};
    for (const r of userRoles.data ?? []) builtInCounts[r.role] = (builtInCounts[r.role] ?? 0) + 1;
    const customCounts: Record<string, number> = {};
    for (const r of userCustom.data ?? []) customCounts[r.custom_role_id] = (customCounts[r.custom_role_id] ?? 0) + 1;

    return {
      permissions: perms.data ?? [],
      builtInRoles: ["member", "approver", "finance", "manager", "admin", "super_admin"] as const,
      builtInMatrix,
      builtInCounts,
      customRoles: (customRoles.data ?? []).map((r) => ({
        ...r,
        permissions: customMatrix[r.id] ?? [],
        userCount: customCounts[r.id] ?? 0,
      })),
    };
  });

/** Update permissions for a built-in role. super_admin is protected (always all-permissions). */
const setBuiltInInput = z.object({
  role: z.enum(["member", "approver", "finance", "manager", "admin"]),
  permissions: z.array(z.string().min(1).max(120)).max(500),
  password: z.string().min(1).max(128),
});
export const setBuiltInRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) => setBuiltInInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_code")
      .eq("role", data.role);

    // Validate every permission exists
    const { data: catalog } = await supabaseAdmin.from("permissions").select("code");
    const known = new Set((catalog ?? []).map((p) => p.code));
    const invalid = data.permissions.filter((p) => !known.has(p));
    if (invalid.length) throw new Response(`Unknown permissions: ${invalid.join(", ")}`, { status: 400 });

    const del = await supabaseAdmin.from("role_permissions").delete().eq("role", data.role);
    if (del.error) throw new Response(del.error.message, { status: 500 });
    if (data.permissions.length) {
      const ins = await supabaseAdmin.from("role_permissions").insert(
        data.permissions.map((p) => ({ role: data.role as never, permission_code: p })),
      );
      if (ins.error) throw new Response(ins.error.message, { status: 500 });
    }

    await writeAudit({
      action: "role.permissions.update",
      entity: "role_permissions",
      entityId: null,
      prev: (prev ?? []).map((p) => p.permission_code),
      next: data.permissions,
      summary: `Updated permissions for built-in role "${data.role}"`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// --- Custom roles CRUD ---

const nameSchema = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[a-z][a-z0-9_-]*$/i, "Use letters, digits, dash or underscore only");

export const createCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z
      .object({
        name: nameSchema,
        description: z.string().trim().max(280).optional(),
        permissions: z.array(z.string()).max(500).default([]),
        password: z.string().min(1).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin
      .from("custom_roles")
      .insert({
        name: data.name,
        description: data.description ?? null,
        created_by: context.userId,
      })
      .select("id, name")
      .single();
    if (error) throw new Response(error.message, { status: 400 });

    if (data.permissions.length) {
      const ins = await supabaseAdmin.from("custom_role_permissions").insert(
        data.permissions.map((p) => ({ custom_role_id: created.id, permission_code: p })),
      );
      if (ins.error) throw new Response(ins.error.message, { status: 500 });
    }

    await writeAudit({
      action: "custom_role.create",
      entity: "custom_roles",
      entityId: created.id,
      prev: null,
      next: { name: created.name, permissions: data.permissions },
      summary: `Created custom role "${created.name}"`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { id: created.id };
  });

export const updateCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        description: z.string().trim().max(280).nullable().optional(),
        is_active: z.boolean().optional(),
        permissions: z.array(z.string()).max(500).optional(),
        password: z.string().min(1).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("custom_roles")
      .select("id, name, description, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Response("Custom role not found", { status: 404 });

    const patch: { description?: string | null; is_active?: boolean } = {};
    if (data.description !== undefined) patch.description = data.description;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    if (Object.keys(patch).length) {
      const upd = await supabaseAdmin.from("custom_roles").update(patch).eq("id", data.id);
      if (upd.error) throw new Response(upd.error.message, { status: 500 });
    }

    let prevPerms: string[] | undefined;
    if (data.permissions) {
      const { data: existing } = await supabaseAdmin
        .from("custom_role_permissions")
        .select("permission_code")
        .eq("custom_role_id", data.id);
      prevPerms = (existing ?? []).map((r) => r.permission_code);
      const del = await supabaseAdmin.from("custom_role_permissions").delete().eq("custom_role_id", data.id);
      if (del.error) throw new Response(del.error.message, { status: 500 });
      if (data.permissions.length) {
        const ins = await supabaseAdmin
          .from("custom_role_permissions")
          .insert(data.permissions.map((p) => ({ custom_role_id: data.id, permission_code: p })));
        if (ins.error) throw new Response(ins.error.message, { status: 500 });
      }
    }

    await writeAudit({
      action: "custom_role.update",
      entity: "custom_roles",
      entityId: data.id,
      prev: { ...prev, permissions: prevPerms },
      next: { ...prev, ...patch, permissions: data.permissions ?? prevPerms },
      summary: `Updated custom role "${prev.name}"`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), password: z.string().min(1).max(128) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("user_custom_roles")
      .select("*", { count: "exact", head: true })
      .eq("custom_role_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Response(
        `Cannot delete: ${count} user(s) still hold this role. Reassign them first.`,
        { status: 400 },
      );
    }

    const { data: prev } = await supabaseAdmin
      .from("custom_roles")
      .select("id, name, description, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Response("Role not found", { status: 404 });

    const { error } = await supabaseAdmin.from("custom_roles").delete().eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });

    await writeAudit({
      action: "custom_role.delete",
      entity: "custom_roles",
      entityId: data.id,
      prev,
      next: null,
      summary: `Deleted custom role "${prev.name}"`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

// =====================================================================
// BRANCHES
// =====================================================================

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [branchesRes, countsRes, managersRes] = await Promise.all([
      supabaseAdmin
        .from("branches")
        .select("id, code, name, address, manager_id, status, created_at")
        .order("name"),
      supabaseAdmin.from("profiles").select("branch_id"),
      supabaseAdmin.from("profiles").select("user_id, full_name, member_number"),
    ]);
    const counts = new Map<string, number>();
    for (const p of countsRes.data ?? []) {
      if (!p.branch_id) continue;
      counts.set(p.branch_id, (counts.get(p.branch_id) ?? 0) + 1);
    }
    const managers = new Map<string, { full_name: string; member_number: string | null }>();
    for (const p of managersRes.data ?? [])
      managers.set(p.user_id, { full_name: p.full_name, member_number: p.member_number });

    return (branchesRes.data ?? []).map((b) => ({
      ...b,
      member_count: counts.get(b.id) ?? 0,
      manager: b.manager_id ? managers.get(b.manager_id) ?? null : null,
    }));
  });

const branchCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, digits and dashes only");

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: branchCodeSchema,
        name: z.string().trim().min(2).max(120),
        address: z.string().trim().max(280).optional(),
        manager_id: z.string().uuid().nullable().optional(),
        password: z.string().min(1).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("branches")
      .insert({
        code: data.code,
        name: data.name,
        address: data.address ?? null,
        manager_id: data.manager_id ?? null,
      })
      .select("id, code, name")
      .single();
    if (error) throw new Response(error.message, { status: 400 });

    await writeAudit({
      action: "branch.create",
      entity: "branches",
      entityId: created.id,
      prev: null,
      next: created,
      summary: `Created branch "${created.name}" (${created.code})`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { id: created.id };
  });

export const updateBranch = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120).optional(),
        address: z.string().trim().max(280).nullable().optional(),
        manager_id: z.string().uuid().nullable().optional(),
        status: z.enum(["active", "disabled"]).optional(),
        password: z.string().min(1).max(128),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("branches")
      .select("id, code, name, address, manager_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Response("Branch not found", { status: 404 });

    const patch: Record<string, unknown> = {};
    const patch: { name?: string; address?: string | null; manager_id?: string | null; status?: "active" | "disabled" } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.address !== undefined) patch.address = data.address;
    if (data.manager_id !== undefined) patch.manager_id = data.manager_id;
    if (data.status !== undefined) patch.status = data.status;

    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await supabaseAdmin.from("branches").update(patch).eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });

    await writeAudit({
      action: "branch.update",
      entity: "branches",
      entityId: data.id,
      prev,
      next: { ...prev, ...patch },
      summary: `Updated branch "${prev.name}"`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true };
  });

/**
 * Merge source branch INTO target: bulk-reassign members, then soft-disable source.
 * Both branches must exist; source is never deleted (audit trail preservation).
 */
export const mergeBranches = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        targetId: z.string().uuid(),
        password: z.string().min(1).max(128),
      })
      .refine((v) => v.sourceId !== v.targetId, { message: "Source and target must differ" })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [src, tgt] = await Promise.all([
      supabaseAdmin.from("branches").select("id, name, code, status").eq("id", data.sourceId).maybeSingle(),
      supabaseAdmin.from("branches").select("id, name, code").eq("id", data.targetId).maybeSingle(),
    ]);
    if (!src.data) throw new Response("Source branch not found", { status: 404 });
    if (!tgt.data) throw new Response("Target branch not found", { status: 404 });

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", data.sourceId);

    const reassign = await supabaseAdmin
      .from("profiles")
      .update({ branch_id: data.targetId })
      .eq("branch_id", data.sourceId);
    if (reassign.error) throw new Response(reassign.error.message, { status: 500 });

    const disable = await supabaseAdmin
      .from("branches")
      .update({ status: "disabled" })
      .eq("id", data.sourceId);
    if (disable.error) throw new Response(disable.error.message, { status: 500 });

    await writeAudit({
      action: "branch.merge",
      entity: "branches",
      entityId: data.sourceId,
      prev: { source: src.data, target: tgt.data, members_moved: 0 },
      next: { source_disabled: true, target: tgt.data.id, members_moved: count ?? 0 },
      summary: `Merged "${src.data.name}" (${src.data.code}) into "${tgt.data.name}" — ${count ?? 0} member(s) reassigned`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { ok: true, moved: count ?? 0 };
  });

// =====================================================================
// LOAN POLICIES (versioned)
// =====================================================================

export const listLoanPolicies = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("loan_policies")
      .select("*")
      .order("version", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });

const publishPolicyInput = z.object({
  interest_rate: z.number().min(0).max(100),
  min_savings: z.number().min(0),
  savings_multiplier: z.number().min(0).max(20),
  min_membership_months: z.number().int().min(0).max(120),
  max_term_months: z.number().int().min(1).max(120),
  emergency_rate: z.number().min(0).max(100),
  emergency_multiplier: z.number().min(0).max(20),
  emergency_max_amount: z.number().min(0),
  emergency_max_term_months: z.number().int().min(1).max(60),
  chapchap_rate: z.number().min(0).max(100),
  late_penalty_rate: z.number().min(0).max(100),
  processing_fee_rate: z.number().min(0).max(100),
  notes: z.string().trim().max(1000).optional(),
  password: z.string().min(1).max(128),
});

export const publishLoanPolicy = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) => publishPolicyInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: latest } = await supabaseAdmin
      .from("loan_policies")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;

    const { password, notes, ...rest } = data;
    const insertRow = {
      ...rest,
      notes: notes ?? null,
      version: nextVersion,
      created_by: context.userId,
    };
    const { data: created, error } = await supabaseAdmin
      .from("loan_policies")
      .insert(insertRow)
      .select("id, version")
      .single();
    if (error) throw new Response(error.message, { status: 400 });

    await writeAudit({
      action: "loan_policy.publish",
      entity: "loan_policies",
      entityId: created.id,
      prev: latest,
      next: insertRow,
      summary: `Published loan policy version ${created.version}`,
      actorId: context.userId,
      meta: context.requestMeta,
    });
    return { id: created.id, version: created.version };
  });
