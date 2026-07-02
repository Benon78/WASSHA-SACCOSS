import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { pageHead } from "@/lib/seo";
import { fmtRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/escalations")({
  head: () => pageHead({
    path: "/escalations",
    title: "My escalated issues — WASSHA SACCOS",
    description: "Track the assistant escalations you have raised and see when an admin resolves or dismisses them.",
    noIndex: true,
  }),
  component: MyEscalationsPage,
});

type Row = {
  id: string; category: string; notes: string; status: string;
  loan_id: string | null; resolution: string | null;
  created_at: string; updated_at: string;
};

function MyEscalationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("assistant_escalations")
      .select("id,category,notes,status,loan_id,resolution,created_at,updated_at")
      .eq("raised_by", user.id)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`my-esc-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "assistant_escalations", filter: `raised_by=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <header>
          <h1 className="text-2xl font-semibold">My escalated issues</h1>
          <p className="text-sm text-muted-foreground">Issues you raised through the assistant. Admins are notified and you'll get a notification the moment they respond.</p>
        </header>

        {rows.length === 0 && (
          <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            You haven't raised any escalations yet.
          </div>
        )}

        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{e.category}</Badge>
                <Badge>{e.status.replace("_", " ")}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">Raised {fmtRelative(e.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.notes}</p>
              {e.loan_id && (
                <Link to="/loans/$loanId" params={{ loanId: e.loan_id }} className="mt-2 inline-block text-xs text-primary underline">
                  View related loan →
                </Link>
              )}
              {e.resolution && (
                <p className="mt-2 rounded bg-muted p-2 text-xs">
                  <strong>Admin response:</strong> {e.resolution}
                </p>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
