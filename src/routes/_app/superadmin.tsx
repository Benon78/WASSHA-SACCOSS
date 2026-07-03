import { createFileRoute, Outlet, Link, Navigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { Shield, LayoutDashboard, Users, KeyRound, Building2, ScrollText, Activity, ShieldAlert, Settings2, Bot, Database, Bell, Cog } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/superadmin")({
  head: () => ({ meta: [{ title: "Super Admin — WASSHA SACCOS" }, { name: "robots", content: "noindex" }] }),
  component: SuperAdminLayout,
});

const NAV = [
  { to: "/superadmin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/superadmin/users", label: "Users", icon: Users },
  { to: "/superadmin/roles", label: "Roles & Permissions", icon: KeyRound },
  { to: "/superadmin/branches", label: "Branches", icon: Building2 },
  { to: "/superadmin/policies", label: "Loan Policies", icon: ScrollText },
  { to: "/superadmin/security", label: "Security Center", icon: ShieldAlert },
  { to: "/superadmin/audit", label: "Audit Logs", icon: Activity },
  { to: "/superadmin/settings", label: "System Settings", icon: Settings2 },
  { to: "/superadmin/ai-config", label: "AI Configuration", icon: Bot },
  { to: "/superadmin/backups", label: "Backup & Restore", icon: Database },
  { to: "/superadmin/monitoring", label: "Monitoring", icon: Activity },
  { to: "/superadmin/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "My Profile", icon: Cog },
] as const;

function SuperAdminLayout() {
  const { hasRole, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!hasRole("super_admin")) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="border-b border-border/60 bg-background/95">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Super Admin</p>
            <p className="text-sm font-semibold">Platform control center</p>
          </div>
        </div>
      </div>
      <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:h-fit">
          <nav className="rounded-xl border border-border/60 bg-background/60 p-2">
            <ul className="space-y-0.5">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = item.exact
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
