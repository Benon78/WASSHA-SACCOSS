/**
 * Public auth-event logger. Called from the sign-in page for
 * successes, failures and vendor OAuth errors so Super Admin
 * → Security Center has a full trail even when the user is
 * unauthenticated (failed sign-up, Google failure, etc.).
 *
 * This intentionally does NOT require auth: the row is written
 * through the admin client with server-sanitized inputs, and the
 * caller can only insert `auth_events` (never anything else).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

const EVENT_TYPES = [
  "login",
  "logout",
  "failed_login",
  "password_change",
  "password_reset",
  "account_locked",
  "account_unlocked",
  "mfa_enrolled",
  "mfa_challenge",
  "email_verified",
] as const;

const schema = z.object({
  eventType: z.enum(EVENT_TYPES),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  provider: z.string().trim().max(40).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  sessionId: z.string().trim().max(200).optional().nullable(),
});

export const logAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
      ua = getRequestHeader("user-agent") ?? null;
    } catch { /* off-request */ }

    const meta: Record<string, unknown> = {};
    if (data.provider) meta.provider = data.provider;
    if (data.reason) meta.reason = data.reason;

    const { error } = await supabaseAdmin.from("auth_events").insert({
      event_type: data.eventType,
      email: data.email ?? null,
      user_id: data.userId ?? null,
      session_id: data.sessionId ?? null,
      ip: ip as never,
      user_agent: ua,
      meta: meta as never,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
