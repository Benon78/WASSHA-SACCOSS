import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;
  return <Outlet />;
}
