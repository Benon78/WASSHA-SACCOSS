import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/status/EmptyState";
import { CardListSkeleton } from "@/components/status/LoadingState";
import { ErrorState, classifyError } from "@/components/status/ErrorState";
import { Bell, Check, CheckCheck } from "lucide-react";
import { pageHead } from "@/lib/seo";

const TYPES = ["all", "loan_update", "loan_approved", "loan_rejected", "deposit", "docs_requested", "system"] as const;
type NotifType = typeof TYPES[number];

const searchSchema = z.object({
  type: fallback(z.enum(TYPES), "all").default("all"),
  state: fallback(z.enum(["all", "unread"]), "all").default("all"),
  page: fallback(z.number().int().min(1), 1).default(1),
});

const PAGE_SIZE = 20;

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
  deferred_until: string | null;
}

export const Route = createFileRoute("/_app/notifications")({
  validateSearch: zodValidator(searchSchema),
  head: () => pageHead({
    path: "/notifications",
    title: "Notifications — WASSHA SACCOS",
    description: "All loan, deposit, document, and system notifications in one inbox.",
    noIndex: true,
  }),
  component: NotificationsPage,
});

function notifQueryKey(userId: string, type: NotifType, state: "all" | "unread", page: number) {
  return ["notifications", userId, type, state, page] as const;
}

function NotificationsPage() {
  const { user } = useAuth();
  const nav = useNavigate({ from: "/_app/notifications" });
  const { type, state, page } = Route.useSearch();
  const queryClient = useQueryClient();

  // Server-side paginated fetch: only the current page's rows travel over the
  // wire, so this scales past thousands of notifications without hitching.
  const query = useQuery({
    enabled: !!user,
    queryKey: user ? notifQueryKey(user.id, type, state, page) : ["notifications", "anon"],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .or("deferred_until.is.null,deferred_until.lte.now()")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (type !== "all") q = q.eq("type", type);
      if (state === "unread") q = q.eq("read", false);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as NotificationRow[], total: count ?? 0 };
    },
    placeholderData: (prev) => prev, // keeps the previous page visible while the next one loads
    staleTime: 15_000,
  });

  // Realtime: any change to this user's notifications just invalidates the
  // cache — no divergence between local state and the server, and pagination
  // stays consistent.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`user-notif-page-${user.id}`, { config: { private: true } } as any)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, queryClient]);

  const markAll = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("notifications")
        .update({ read: true }).eq("user_id", user.id).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => user && queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
  });

  const toggleRead = useMutation({
    mutationFn: async (n: NotificationRow) => {
      const { error } = await supabase.from("notifications").update({ read: !n.read }).eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => user && queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
  });

  const total = query.data?.total ?? 0;
  const rows = query.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to page 1 when filters change (URL-driven).
  type NotifSearch = z.infer<typeof searchSchema>;
  const setFilter = (patch: Partial<{ type: NotifType; state: "all" | "unread" }>) => {
    nav({ search: (prev: NotifSearch) => ({ ...prev, ...patch, page: 1 }), replace: true });
  };
  const goPage = (p: number) => nav({ search: (prev: NotifSearch) => ({ ...prev, page: p }), replace: true });

  const filtersRow = useMemo(() => (
    <div className="flex flex-wrap gap-2">
      {TYPES.map((t) => (
        <button key={t} onClick={() => setFilter({ type: t })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${type === t ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
          {t.replace("_", " ")}
        </button>
      ))}
      <span className="mx-2 self-center text-muted-foreground">|</span>
      {(["all", "unread"] as const).map((s) => (
        <button key={s} onClick={() => setFilter({ state: s })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${state === s ? "bg-secondary text-secondary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
          {s}
        </button>
      ))}
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [type, state]);

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bell className="h-6 w-6 text-primary" /> Notifications</h1>
          <Button onClick={() => markAll.mutate()} disabled={markAll.isPending} variant="outline" size="sm">
            <CheckCheck className="mr-2 h-4 w-4" />Mark all read
          </Button>
        </div>

        {filtersRow}

        {query.isLoading ? (
          <CardListSkeleton items={5} />
        ) : query.isError ? (
          <ErrorState kind={classifyError(query.error)} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description={state === "unread" ? "You're all caught up." : "No notifications match these filters."}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((n) => {
              const Body = (
                <div className="flex items-start gap-3 p-4">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{n.type.replace("_", " ")}</span>
                    </div>
                    {n.body && <p className="mt-1 text-sm text-muted-foreground break-words">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{fmtRelative(n.created_at)}</p>
                  </div>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleRead.mutate(n); }}
                    aria-label={n.read ? "Mark notification as unread" : "Mark notification as read"}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={n.read ? "Mark unread" : "Mark read"}>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              );
              const cls = `block rounded-2xl border ${n.read ? "border-border/70 bg-card" : "border-primary/30 bg-primary/5"} shadow-[var(--shadow-card)] transition hover:bg-muted/40`;
              return (
                <li key={n.id}>
                  {n.link
                    ? <Link to={n.link} onClick={() => !n.read && toggleRead.mutate(n)} className={cls}>{Body}</Link>
                    : <div className={cls}>{Body}</div>}
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} total{query.isFetching && !query.isLoading ? " · refreshing…" : ""}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
