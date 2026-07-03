/**
 * Records / refreshes the caller's row in `user_sessions` so the
 * Super Admin → Security Center can see live sessions.
 *
 * Called from the client after `SIGNED_IN` and once per app boot.
 * Uses the admin client to bypass RLS (the caller identity is verified
 * by requireSupabaseAuth).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseUA(ua: string | null) {
  const s = (ua ?? "").toLowerCase();
  let browser: string | null = null;
  if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("chrome/")) browser = "Chrome";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("safari/")) browser = "Safari";
  let os: string | null = null;
  if (s.includes("windows")) os = "Windows";
  else if (s.includes("mac os")) os = "macOS";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) os = "iOS";
  else if (s.includes("linux")) os = "Linux";
  const device = s.includes("mobile") ? "Mobile" : "Desktop";
  return { browser, os, device };
}

export const recordSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ sessionId: z.string().min(1).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
      ua = getRequestHeader("user-agent") ?? null;
    } catch { /* off-request */ }
    const { browser, os, device } = parseUA(ua);
    const now = new Date().toISOString();

    // Look for a live row for the same session marker; refresh it.
    const { data: existing } = await supabaseAdmin
      .from("user_sessions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("session_id", data.sessionId)
      .is("revoked_at", null)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("user_sessions")
        .update({ last_seen: now, ip: ip as never, user_agent: ua, browser, os, device })
        .eq("id", existing.id);
      return { ok: true, id: existing.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("user_sessions")
      .insert({
        user_id: context.userId,
        session_id: data.sessionId,
        ip: ip as never,
        user_agent: ua,
        browser, os, device,
        last_seen: now,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: row.id };
  });
