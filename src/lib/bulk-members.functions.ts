import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BulkMemberRow = {
  email: string;
  member_number?: string | null;
  full_name?: string | null;
  phone?: string | null;
  joined_at?: string | null;
  opening_balance?: number | null;
};

export type BulkImportResult = {
  updated: number;
  notFound: string[];
  errors: { email: string; error: string }[];
};

export const bulkImportMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: BulkMemberRow[] }) => {
    if (!input || !Array.isArray(input.rows)) throw new Error("rows required");
    if (input.rows.length === 0) throw new Error("no rows to import");
    if (input.rows.length > 1000) throw new Error("Max 1000 rows per import");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: BulkImportResult = { updated: 0, notFound: [], errors: [] };

    // Get all users once (paginated). For small SACCOs this is fine.
    const emailToUserId = new Map<string, string>();
    let page = 1;
    while (page < 20) {
      const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      usersPage.users.forEach((u) => { if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id); });
      if (usersPage.users.length < 200) break;
      page++;
    }

    for (const row of data.rows) {
      const email = row.email?.trim().toLowerCase();
      if (!email) { result.errors.push({ email: "(blank)", error: "Missing email" }); continue; }
      const uid = emailToUserId.get(email);
      if (!uid) { result.notFound.push(email); continue; }

      const update: Record<string, any> = {};
      if (row.member_number != null && row.member_number !== "") update.member_number = String(row.member_number).trim();
      if (row.full_name != null && row.full_name !== "") update.full_name = String(row.full_name).trim();
      if (row.phone != null && row.phone !== "") update.phone = String(row.phone).trim();
      if (row.joined_at != null && row.joined_at !== "") update.joined_at = new Date(row.joined_at).toISOString();
      if (row.opening_balance != null && !Number.isNaN(Number(row.opening_balance))) update.opening_balance = Number(row.opening_balance);

      if (Object.keys(update).length === 0) continue;

      const { error } = await supabaseAdmin.from("profiles").update(update).eq("user_id", uid);
      if (error) result.errors.push({ email, error: error.message });
      else result.updated++;
    }

    // Audit log
    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "bulk_member_import",
      entity: "profiles",
      meta: {
        summary: `Bulk imported ${result.updated} members (${result.notFound.length} not found, ${result.errors.length} errors)`,
        source: "admin_bulk_import",
        counts: { updated: result.updated, not_found: result.notFound.length, errors: result.errors.length },
      },
    });

    return result;
  });
