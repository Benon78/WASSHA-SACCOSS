import { createFileRoute } from "@tanstack/react-router";
import { Bot, Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/ai-config")({
  head: () => ({ meta: [{ title: "AI Configuration — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: AiConfigPage,
});

function AiConfigPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">AI configuration</h1>
        <p className="text-sm text-muted-foreground">
          The in-app assistant runs on the platform AI Gateway. Model routing is managed automatically and never sees a member's password, session token or bank data. All assistant actions are gated by role and audit-logged.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card icon={Bot} title="Assistant" value="Enabled" hint="Available to signed-in members and staff" />
        <Card icon={Sparkles} title="Model routing" value="Automatic" hint="Fast → Standard escalation" />
        <Card icon={ShieldCheck} title="Guardrails" value="Enforced" hint="Human required for money movement" />
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="font-semibold">Safety policy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Assistant sessions cannot write to financial tables (append-only guard).</li>
          <li>Any request that requires money movement is escalated to a human.</li>
          <li>Requests, model responses and escalations are logged in the audit ledger.</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ icon: Icon, title, value, hint }: { icon: typeof Bot; title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
