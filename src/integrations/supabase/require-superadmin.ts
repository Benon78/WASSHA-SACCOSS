import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side gate: caller must have the super_admin role.
 * Also exposes request metadata (ip / ua / sid) for audit logging.
 */
export const requireSuperAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper, error } = await supabase.rpc("is_super_admin", {
      _user_id: userId,
    });
    if (error) throw new Response("Failed to verify role", { status: 500 });
    if (!isSuper) throw new Response("Forbidden — super admin only", { status: 403 });

    let ip: string | null = null;
    let ua: string | null = null;
    let sid: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
      ua = getRequestHeader("user-agent") ?? null;
      const authz = getRequestHeader("authorization") ?? "";
      // JWT payload as opaque session marker (do NOT log the token itself).
      const parts = authz.replace(/^Bearer\s+/i, "").split(".");
      if (parts.length === 3) {
        // last 8 chars of signature — enough to correlate sessions in the log.
        sid = parts[2].slice(-8);
      }
    } catch {
      /* header helpers may throw off-request; safe to ignore */
    }
    return next({ context: { requestMeta: { ip, ua, sid } } });
  });

export type RequestMeta = { ip: string | null; ua: string | null; sid: string | null };
