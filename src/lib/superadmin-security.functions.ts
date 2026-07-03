/**
 * Super Admin — Security, Audit, and Settings server functions.
 *
 * Every mutation:
 *   - gated by requireSuperAdmin
 *   - password re-verification for destructive actions
 *   - writes to the immutable audit_log with prev/new snapshots
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperAdmin } from "@/integrations/supabase/require-superadmin";

// -------- shared helpers (kept local) --------

async function verifyCallerPassword(email: string, password: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Response("Password verification failed", { status: 401 });
}

async function assertCallerPassword(callerId: string, password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(callerId);
  if (!data.user?.email) throw new Response("Account has no email on file", { status: 400 });
  await verifyCallerPassword(data.user.email, password);
}

type Meta = { ip: string | null; ua: string | null; sid: string | null };
async function writeAudit(a: {
  action: string; entity: string; entityId: string | null;
  prev?: unknown; next?: unknown; summary: string;
  actorId: string; meta: Meta;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    actor_id: a.actorId, action: a.action, entity: a.entity, entity_id: a.entityId,
    ip: a.meta.ip, user_agent: a.meta.ua, session_id: a.meta.sid,
    prev_value: (a.prev ?? null) as never, new_value: (a.next ?? null) as never,
    meta: { summary: a.summary, source: "superadmin" } as never,
  });
}

// =====================================================================
// SECURITY CENTER
// =====================================================================

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [failed24, failed7d, locked, active, recentFailed, recentLogins] = await Promise.all([
      supabaseAdmin.from("auth_events").select("*", { count: "exact", head: true })
        .eq("event_type", "failed_login").gte("created_at", since24),
      supabaseAdmin.from("auth_events").select("*", { count: "exact", head: true })
        .eq("event_type", "failed_login").gte("created_at", since7d),
      supabaseAdmin.from("auth_events").select("*", { count: "exact", head: true })
        .eq("event_type", "account_locked").gte("created_at", since7d),
      supabaseAdmin.from("user_sessions").select("*", { count: "exact", head: true })
        .is("revoked_at", null).gte("last_seen", since24),
      supabaseAdmin.from("auth_events")
        .select("id, user_id, email, ip, user_agent, created_at, event_type")
        .eq("event_type", "failed_login")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("auth_events")
        .select("id, user_id, email, ip, user_agent, created_at, event_type")
        .in("event_type", ["login", "password_reset", "account_unlocked"])
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // group failed logins by IP for a simple "suspicious" list
    const ipCount = new Map<string, { ip: string; attempts: number; last: string; lastEmail: string | null }>();
    for (const e of recentFailed.data ?? []) {
      const key = e.ip == null ? "unknown" : String(e.ip);
      const cur = ipCount.get(key) ?? { ip: key, attempts: 0, last: e.created_at, lastEmail: e.email };
      cur.attempts += 1;
      if (e.created_at > cur.last) { cur.last = e.created_at; cur.lastEmail = e.email; }
      ipCount.set(key, cur);
    }
    const suspiciousIps = [...ipCount.values()].filter((r) => r.attempts >= 5).sort((a, b) => b.attempts - a.attempts).slice(0, 10);

    return {
      failedLogins24h: failed24.count ?? 0,
      failedLogins7d: failed7d.count ?? 0,
      lockedAccounts7d: locked.count ?? 0,
      activeSessions24h: active.count ?? 0,
      recentFailed: (recentFailed.data ?? []).map((e) => ({ ...e, ip: e.ip == null ? null : String(e.ip) })),
      recentLogins: (recentLogins.data ?? []).map((e) => ({ ...e, ip: e.ip == null ? null : String(e.ip) })),
      suspiciousIps,
    };
  });

export const listActiveSessions = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z.object({
      page: z.number().int().min(1).max(10_000).default(1),
      pageSize: z.number().int().min(10).max(100).default(50),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await supabaseAdmin
      .from("user_sessions")
      .select("id, user_id, session_id, ip, user_agent, device, browser, os, location, last_seen, created_at", { count: "exact" })
      .is("revoked_at", null)
      .order("last_seen", { ascending: false })
      .range(from, to);
    if (error) throw new Response(error.message, { status: 500 });

    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("user_id, full_name, member_number").in("user_id", ids)
      : { data: [] as { user_id: string; full_name: string; member_number: string | null }[] };
    const pmap = new Map<string, { full_name: string; member_number: string | null }>();
    for (const p of profiles ?? []) pmap.set(p.user_id, { full_name: p.full_name, member_number: p.member_number });

    return {
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      rows: (rows ?? []).map((r) => ({
        ...r,
        ip: r.ip == null ? null : String(r.ip),
        profile: pmap.get(r.user_id) ?? null,
      })),
    };
  });

export const terminateSession = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z.object({ sessionId: z.string().uuid(), password: z.string().min(1).max(128) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("user_sessions").select("*").eq("id", data.sessionId).maybeSingle();
    if (!prev) throw new Response("Session not found", { status: 404 });

    const { error } = await supabaseAdmin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("id", data.sessionId);
    if (error) throw new Response(error.message, { status: 500 });

    // Best-effort: sign the user out globally at the auth layer.
    await supabaseAdmin.auth.admin.signOut(prev.user_id, "global").catch(() => undefined);

    await writeAudit({
      action: "session.terminate", entity: "user_sessions", entityId: data.sessionId,
      prev, next: { ...prev, revoked_at: "now()", revoked_by: context.userId },
      summary: `Terminated session for user ${prev.user_id}`,
      actorId: context.userId, meta: context.requestMeta,
    });
    return { ok: true };
  });

// =====================================================================
// AUDIT CENTER
// =====================================================================

const listAuditInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(50),
  entity: z.string().trim().max(64).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().max(64).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});

export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) => listAuditInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("audit_log")
      .select("id, actor_id, action, entity, entity_id, ip, user_agent, session_id, meta, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    if (data.fromDate) q = q.gte("created_at", data.fromDate);
    if (data.toDate) q = q.lte("created_at", data.toDate);
    if (data.search) q = q.ilike("meta->>summary", `%${data.search}%`);

    const { data: rows, count, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });

    const ids = [...new Set((rows ?? []).map((r) => r.actor_id).filter((v): v is string => !!v))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("user_id, full_name, member_number").in("user_id", ids)
      : { data: [] as { user_id: string; full_name: string; member_number: string | null }[] };
    const pmap = new Map<string, { full_name: string; member_number: string | null }>();
    for (const p of profiles ?? []) pmap.set(p.user_id, { full_name: p.full_name, member_number: p.member_number });

    return {
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      rows: (rows ?? []).map((r) => ({
        ...r,
        ip: r.ip == null ? null : String(r.ip),
        actor: r.actor_id ? pmap.get(r.actor_id) ?? null : null,
      })),
    };
  });

export const getAuditDetail = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("audit_log").select("*").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Response("Not found", { status: 404 });
    let actor: { full_name: string; member_number: string | null } | null = null;
    if (row.actor_id) {
      const { data: p } = await supabaseAdmin
        .from("profiles").select("full_name, member_number").eq("user_id", row.actor_id).maybeSingle();
      actor = p ?? null;
    }
    return { ...row, ip: row.ip == null ? null : String(row.ip), actor };
  });

/** Export audit rows (paginated) as CSV. Export itself is audited. */
export const exportAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z.object({
      password: z.string().min(1).max(128),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      entity: z.string().trim().max(64).optional(),
      limit: z.number().int().min(1).max(10_000).default(1000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("id, actor_id, action, entity, entity_id, ip, user_agent, session_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.fromDate) q = q.gte("created_at", data.fromDate);
    if (data.toDate) q = q.lte("created_at", data.toDate);
    if (data.entity) q = q.eq("entity", data.entity);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });

    const escape = (v: unknown) => {
      const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const headers = ["id", "created_at", "actor_id", "action", "entity", "entity_id", "ip", "user_agent", "summary"];
    const lines = [headers.join(",")];
    for (const r of rows ?? []) {
      const summary = (r.meta as { summary?: string } | null)?.summary ?? "";
      lines.push([
        r.id, r.created_at, r.actor_id ?? "", r.action, r.entity, r.entity_id ?? "",
        r.ip == null ? "" : String(r.ip), r.user_agent ?? "", summary,
      ].map(escape).join(","));
    }
    const csv = lines.join("\n");

    await writeAudit({
      action: "audit.export", entity: "audit_log", entityId: null,
      prev: null, next: { rows: rows?.length ?? 0, filters: { entity: data.entity, fromDate: data.fromDate, toDate: data.toDate } },
      summary: `Exported ${rows?.length ?? 0} audit rows as CSV`,
      actorId: context.userId, meta: context.requestMeta,
    });
    return { csv, rows: rows?.length ?? 0 };
  });

// =====================================================================
// SYSTEM SETTINGS  (versioned key/JSONB)
// =====================================================================

/**
 * Known setting keys with their default shape. Any key not listed is still
 * readable, but the UI only offers editors for these.
 */
const SETTING_KEYS = [
  "security.password_policy",
  "security.session",
  "notifications.templates",
  "app.branding",
] as const;

const DEFAULTS: Record<(typeof SETTING_KEYS)[number], unknown> = {
  "security.password_policy": {
    min_length: 12, require_upper: true, require_lower: true, require_digit: true, require_symbol: true,
    reuse_prevention: 5, max_age_days: 180,
  },
  "security.session": {
    inactivity_timeout_minutes: 30, absolute_timeout_hours: 12,
    mfa_required_for_admins: true, ip_change_reauth: true,
  },
  "notifications.templates": {
    loan_approved: "Loan {{loan_number}} for {{amount}} has been approved.",
    loan_rejected: "Loan {{loan_number}} was rejected: {{reason}}",
    account_suspended: "Your account has been suspended: {{reason}}",
  },
  "app.branding": {
    org_name: "WASSHA SACCOS",
    support_email: "support@wassha.example",
    footer_note: "Regulated by TCDC — Tanzania.",
  },
};

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("key, value, version, updated_by, created_at")
      .eq("is_current", true);
    if (error) throw new Response(error.message, { status: 500 });

    const map = new Map<string, { value: unknown; version: number; updated_by: string | null; created_at: string }>();
    for (const r of data ?? []) map.set(r.key, {
      value: r.value, version: r.version, updated_by: r.updated_by, created_at: r.created_at,
    });

    return SETTING_KEYS.map((key) => {
      const cur = map.get(key);
      return {
        key,
        value: (cur?.value ?? DEFAULTS[key]) as unknown,
        version: cur?.version ?? 0,
        updated_by: cur?.updated_by ?? null,
        updated_at: cur?.created_at ?? null,
        exists: !!cur,
      };
    });
  });

export const getSettingHistory = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) => z.object({ key: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("system_settings")
      .select("id, version, is_current, value, updated_by, created_at")
      .eq("key", data.key)
      .order("version", { ascending: false })
      .limit(50);
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });

const settingSchemas: Record<(typeof SETTING_KEYS)[number], z.ZodType> = {
  "security.password_policy": z.object({
    min_length: z.number().int().min(8).max(64),
    require_upper: z.boolean(),
    require_lower: z.boolean(),
    require_digit: z.boolean(),
    require_symbol: z.boolean(),
    reuse_prevention: z.number().int().min(0).max(24),
    max_age_days: z.number().int().min(0).max(365),
  }),
  "security.session": z.object({
    inactivity_timeout_minutes: z.number().int().min(5).max(720),
    absolute_timeout_hours: z.number().int().min(1).max(72),
    mfa_required_for_admins: z.boolean(),
    ip_change_reauth: z.boolean(),
  }),
  "notifications.templates": z.record(z.string(), z.string().max(2000)),
  "app.branding": z.object({
    org_name: z.string().trim().min(1).max(120),
    support_email: z.string().email().max(180),
    footer_note: z.string().trim().max(280).optional().default(""),
  }),
};

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((i: unknown) =>
    z.object({
      key: z.enum(SETTING_KEYS),
      value: z.unknown(),
      password: z.string().min(1).max(128),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCallerPassword(context.userId, data.password);
    // Per-key schema validation
    const parsed = settingSchemas[data.key].parse(data.value);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("system_settings")
      .select("id, value, version")
      .eq("key", data.key)
      .eq("is_current", true)
      .maybeSingle();
    const nextVersion = (prev?.version ?? 0) + 1;

    // Demote previous current row (if any)
    if (prev) {
      const demote = await supabaseAdmin
        .from("system_settings").update({ is_current: false }).eq("id", prev.id);
      if (demote.error) throw new Response(demote.error.message, { status: 500 });
    }
    const { data: created, error } = await supabaseAdmin
      .from("system_settings")
      .insert({
        key: data.key,
        value: parsed as never,
        version: nextVersion,
        is_current: true,
        updated_by: context.userId,
      })
      .select("id, version")
      .single();
    if (error) {
      // rollback demotion best-effort
      if (prev) await supabaseAdmin.from("system_settings").update({ is_current: true }).eq("id", prev.id);
      throw new Response(error.message, { status: 400 });
    }

    await writeAudit({
      action: "settings.update", entity: "system_settings", entityId: created.id,
      prev: prev?.value ?? null, next: parsed,
      summary: `Updated setting "${data.key}" → v${created.version}`,
      actorId: context.userId, meta: context.requestMeta,
    });
    return { ok: true, version: created.version };
  });
