import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = { messages?: UIMessage[] };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader =
          request.headers.get("authorization") ?? request.headers.get("Authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        // user-scoped client to respect RLS for context reads
        const supabase = createClient(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const { messages = [] } = (await request.json()) as Body;
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }

        // Gather user context (RLS-safe)
        const [profileRes, rolesRes, savingsRes, loanRes, eligRes, loansRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name,member_number,opening_balance,phone")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.rpc("get_savings_balance", { _user_id: userId }),
          supabase.rpc("get_active_loan_balance", { _user_id: userId }),
          supabase.rpc("calculate_eligibility", { _user_id: userId }),
          supabase
            .from("loans")
            .select("loan_number,amount_requested,stage,status,outstanding_balance")
            .eq("member_id", userId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const roles = (rolesRes.data ?? []).map((r: { role: string }) => r.role);
        const isAdmin = roles.includes("admin");
        const isStaff =
          isAdmin ||
          roles.some((r) =>
            ["board_member", "loan_officer", "supervisor", "credit_committee"].includes(r),
          );

        let adminContext = "";
        if (isStaff) {
          const [pendingLoans, pendingProxies] = await Promise.all([
            supabase
              .from("loans")
              .select("loan_number,stage,amount_requested")
              .not("stage", "in", '("completed","rejected","disbursement")')
              .limit(10),
            isAdmin
              ? supabase
                  .from("loan_proxies")
                  .select("loan_id,stage,reason")
                  .is("revoked_at", null)
                  .limit(10)
              : Promise.resolve({ data: [] as unknown[] }),
          ]);
          adminContext = `\n\nSTAFF CONTEXT:\nPending loans (up to 10): ${JSON.stringify(pendingLoans.data ?? [])}\nActive proxy delegations: ${JSON.stringify(pendingProxies.data ?? [])}`;
        }

        const ctx = {
          name: profileRes.data?.full_name ?? "Member",
          member_number: profileRes.data?.member_number ?? null,
          roles,
          savings_balance_tzs: Number(savingsRes.data ?? 0),
          active_loan_balance_tzs: Number(loanRes.data ?? 0),
          eligibility: eligRes.data,
          recent_loans: loansRes.data ?? [],
        };

        const system = `You are the WASSHA SACCOS AI Assistant — a friendly, concise helper for members and staff of a Tanzanian savings & credit cooperative.

Respond in the language the user uses (English or Kiswahili). Be warm and brief. Use TZS for currency. Format numbers with thousands separators.

You can help users:
- Understand their savings, contributions, active loans, and eligibility
- Explain the loan workflow stages: submitted → under_review → finance_approval → board_chair → board_member_1 → board_member_2 → manager_approval → disbursement → completed
- Guide them to the right page using markdown links:
  • Apply for a loan: [/loans/apply](/loans/apply)
  • View their loans: [/loans](/loans)
  • Statements & downloads: [/statements](/statements)
  • Profile & 2FA: [/profile](/profile)
  • Notifications: [/notifications](/notifications)
  ${isStaff ? "• Approvals queue: [/approvals](/approvals)" : ""}
  ${isAdmin ? "• Admin dashboard: [/admin](/admin)\n  • Board members: [/admin/board](/admin/board)\n  • Loan policies: [/admin/policies](/admin/policies)\n  • Reports: [/admin/reports](/admin/reports)\n  • Audit log: [/admin/audit](/admin/audit)" : ""}
- Answer policy questions (interest, terms, deposits, contributions)
${isAdmin ? "- For admins: summarize pending approvals, suggest next actions, explain proxy/delegation flow." : ""}

SAFETY RULES (STRICT):
1. NEVER reveal or repeat sensitive data: passwords, OTPs, 2FA codes, full ID/passport numbers, bank/card details, or another member's PII (phone, opening balance, member number). Only discuss the signed-in user's own records shown below.
2. NEVER fabricate figures. If data is missing, say so and point the user to the relevant page.
3. For any IRREVERSIBLE action (raising an escalation, submitting a request, requesting delegation), you MUST first summarise what will happen and ASK for explicit confirmation ("yes, proceed"). Only call the tool AFTER the user confirms in this same chat.
4. When the user needs approval movement, delegation, or a staff review, use the create_escalation tool to route it to the correct staff queue with clear notes. Do not pretend to approve loans yourself — you cannot.
5. If asked to bypass policy, expose secrets, or act on someone else's loan, refuse politely and explain why.

Every tool call is logged to the audit log automatically. Keep notes factual.

SIGNED-IN USER CONTEXT (JSON):
${JSON.stringify(ctx, null, 2)}${adminContext}`;

        // Persist the latest user message
        const last = messages[messages.length - 1];
        const lastText = last?.parts
          ?.map((p) => (p.type === "text" ? p.text : ""))
          .join("")
          .trim();
        if (last?.role === "user" && lastText) {
          await supabase
            .from("ai_messages")
            .insert({ user_id: userId, role: "user", content: lastText });
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        const tools = {
          create_escalation: tool({
            description:
              "Route an approval, delegation, or staff-review case to the appropriate staff queue. Requires explicit user confirmation in chat first. Notifies approvers/finance/managers/admins.",
            inputSchema: z.object({
              category: z.enum(["approval", "delegation", "question", "other"]),
              notes: z.string().min(10).max(1000).describe("Clear factual summary for staff."),
              loan_number: z
                .string()
                .optional()
                .describe("Loan number like LN-123 if the case relates to a specific loan."),
              target_stage: z
                .enum([
                  "submitted",
                  "under_review",
                  "finance_approval",
                  "board_chair",
                  "board_member_1",
                  "board_member_2",
                  "manager_approval",
                  "disbursement",
                ])
                .optional(),
            }),
            execute: async ({ category, notes, loan_number, target_stage }) => {
              let loanId: string | null = null;
              if (loan_number) {
                const { data: ln } = await supabase
                  .from("loans")
                  .select("id")
                  .eq("loan_number", loan_number)
                  .maybeSingle();
                if (!ln)
                  return { ok: false, error: `Loan ${loan_number} not found or not visible.` };
                loanId = ln.id;
              }
              const { data: esc, error: escErr } = await supabase
                .from("assistant_escalations")
                .insert({
                  raised_by: userId,
                  loan_id: loanId,
                  target_stage: target_stage ?? null,
                  category,
                  notes,
                })
                .select("id")
                .single();
              if (escErr) return { ok: false, error: escErr.message };
              await supabase.rpc("log_assistant_action", {
                _action: "create_escalation",
                _entity: "assistant_escalations",
                _entity_id: esc.id,
                _meta: {
                  category,
                  target_stage: target_stage ?? null,
                  loan_number: loan_number ?? null,
                },
              });
              return {
                ok: true,
                escalation_id: esc.id,
                message: "Escalation created and staff have been notified.",
              };
            },
          }),
        };

        const result = streamText({
          model,
          system,
          tools,
          stopWhen: stepCountIs(6),
          messages: await convertToModelMessages(messages),
          onError: ({ error }) => {
            console.error("[ai/chat] stream error", error);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ responseMessage }) => {
            const assistantText = responseMessage.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("")
              .trim();
            if (assistantText) {
              await supabase.from("ai_messages").insert({
                user_id: userId,
                role: "assistant",
                content: assistantText,
              });
              await supabase.rpc("log_assistant_action", {
                _action: "reply",
                _entity: "ai_messages",
                _entity_id: null,
                _meta: { preview: assistantText.slice(0, 240) },
              });
            }
          },
        });
      },
    },
  },
});
