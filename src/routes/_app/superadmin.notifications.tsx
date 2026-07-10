import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — Super Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: NotificationsAdmin,
});

function NotificationsAdmin() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Delivery preferences, quiet hours and digest windows are managed per user under their
          profile. Broadcast templates live in{" "}
          <span className="font-medium">System settings → Notification templates</span>.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Bell className="h-4 w-4 text-primary" /> Delivery channels
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          In-app notifications are always enabled. Email/SMS gateways can be wired in from System
          Settings when those secrets are added to the platform.
        </p>
      </section>
    </div>
  );
}
