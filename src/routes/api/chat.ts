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
        const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
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
          supabase.from("profiles").select("full_name,member_number,opening_balance,phone").eq("user_id", userId).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.rpc("get_savings_balance", { _user_id: userId }),
          supabase.rpc("get_active_loan_balance", { _user_id: userId }),
          supabase.rpc("calculate_eligibility", { _user_id: userId }),
          supabase.from("loans").select("loan_number,amount_requested,stage,status,outstanding_balance").eq("member_id", userId).order("created_at", { ascending: false }).limit(5),
        ]);

        const roles = (rolesRes.data ?? []).map((r: { role: string }) => r.role);
        const isAdmin = roles.includes("admin");
        const isStaff = isAdmin || roles.some((r) => ["board_member", "loan_officer", "supervisor", "credit_committee"].includes(r));

        let adminContext = "";
        if (isStaff) {
          const [pendingLoans, pendingProxies] = await Promise.all([
            supabase.from("loans").select("loan_number,stage,amount_requested").not("stage", "in", '("completed","rejected","disbursement")').limit(10),
            isAdmin
              ? supabase.from("loan_proxies").select("loan_id,stage,reason").is("revoked_at", null).limit(10)
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
- Explain the loan workflow stages: application → loan_officer_review → supervisor_review → credit_committee → board → disbursement → completed
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

NEVER expose other members' personal data. Only discuss the signed-in user's own records below.
Never invent figures — if data is missing, say so and suggest where to find it.

SIGNED-IN USER CONTEXT (JSON):
${JSON.stringify(ctx, null, 2)}${adminContext}`;

        // Persist the latest user message
        const last = messages[messages.length - 1];
        const lastText = last?.parts
          ?.map((p) => (p.type === "text" ? p.text : ""))
          .join("")
          .trim();
        if (last?.role === "user" && lastText) {
          await supabase.from("ai_messages").insert({ user_id: userId, role: "user", content: lastText });
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        const result = streamText({
          model,
          system,
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
            }
          },
        });
      },
    },
  },
});
