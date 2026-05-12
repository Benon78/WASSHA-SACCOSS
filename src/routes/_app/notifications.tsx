import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — WASSHA SACCOS" }] }),
  component: NotificationsPage,
});

const TYPES = ["all", "loan_update", "loan_approved", "loan_rejected", "deposit", "docs_requested", "system"];

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [readState, setReadState] = useState<"all" | "unread">("all");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*")
      .order("created_at", { ascending: false }).limit(200);
    setItems(data ?? []);
  };

  useEffect(() => { load(); }, [user?.id]);

  const filtered = items.filter((i) => (filter === "all" || i.type === filter) && (readState === "all" || !i.read));

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    load();
  };

  const toggleRead = async (n: any) => {
    await supabase.from("notifications").update({ read: !n.read }).eq("id", n.id);
    setItems((p) => p.map((i) => i.id === n.id ? { ...i, read: !n.read } : i));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bell className="h-6 w-6 text-primary" /> Notifications</h1>
          <Button onClick={markAll} variant="outline" size="sm"><CheckCheck className="mr-2 h-4 w-4" />Mark all read</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === t ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
              {t.replace("_", " ")}
            </button>
          ))}
          <span className="mx-2 self-center text-muted-foreground">|</span>
          {(["all", "unread"] as const).map((s) => (
            <button key={s} onClick={() => setReadState(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${readState === s ? "bg-secondary text-secondary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {filtered.length === 0 ? (
            <li className="rounded-2xl border border-border/70 bg-card p-12 text-center text-sm text-muted-foreground">No notifications match these filters.</li>
          ) : filtered.map((n) => {
            const Body = (
              <div className="flex items-start gap-3 p-4">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted" : "bg-primary"}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{n.type.replace("_", " ")}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtRelative(n.created_at)}</p>
                </div>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleRead(n); }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={n.read ? "Mark unread" : "Mark read"}>
                  <Check className="h-4 w-4" />
                </button>
              </div>
            );
            const cls = `block rounded-2xl border ${n.read ? "border-border/70 bg-card" : "border-primary/30 bg-primary/5"} shadow-[var(--shadow-card)] transition hover:bg-muted/40`;
            return (
              <li key={n.id}>
                {n.link ? <Link to={n.link} onClick={() => !n.read && toggleRead(n)} className={cls}>{Body}</Link>
                       : <div className={cls}>{Body}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
