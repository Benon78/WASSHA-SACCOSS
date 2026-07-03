import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { AssistantWidget } from "@/components/AssistantWidget";
import { MfaGate } from "@/components/MfaGate";
import { Skeleton } from "@/components/ui/skeleton";
import { safeInternalPath } from "@/lib/safeUrl";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const nav = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const raw = `${location.pathname}${location.searchStr ?? ""}${location.hash ?? ""}`;
      const redirect = safeInternalPath(raw);
      nav({
        to: "/auth",
        replace: true,
        search: redirect && redirect !== "/" ? { redirect } : {},
      });
    }
  }, [user, loading, location, nav]);

  useEffect(() => {
    if (isPasswordRecovery) {
      nav({ to: "/reset-password", replace: true });
    }
  }, [isPasswordRecovery, nav]);

  if (loading || !user) {
    return <AppShellSkeleton />;
  }

  return (
    <MfaGate>
      <Outlet />
      <AssistantWidget />
    </MfaGate>
  );
}

function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
