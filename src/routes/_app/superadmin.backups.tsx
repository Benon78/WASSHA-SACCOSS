import { createFileRoute } from "@tanstack/react-router";
import { Database, ShieldCheck, Clock, HardDrive } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/backups")({
  head: () => ({
    meta: [{ title: "Backups & Restore — Super Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: BackupsPage,
});

function BackupsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Backups &amp; restore</h1>
        <p className="text-sm text-muted-foreground">
          Backups are managed by the platform. Point-in-time recovery, daily snapshots and
          encryption at rest are enabled by default for this deployment.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={Database} title="Daily snapshots" value="Enabled" tone="ok" />
        <Card icon={Clock} title="Point-in-time recovery" value="7 days" tone="ok" />
        <Card icon={ShieldCheck} title="Encryption at rest" value="AES-256" tone="ok" />
        <Card icon={HardDrive} title="Storage backups" value="Replicated" tone="ok" />
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="font-semibold">Restore requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          To restore data to an earlier point in time, open a support request from the Cloud
          dashboard. Restores are audit-logged and require Super Admin re-authentication before they
          are applied.
        </p>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon: typeof Database;
  title: string;
  value: string;
  tone: "ok" | "warn";
}) {
  const color = tone === "ok" ? "text-success" : "text-warning";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${color}`} /> {title}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
