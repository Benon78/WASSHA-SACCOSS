import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/escalations")({
  head: () => ({ meta: [{ title: "Assistant Escalations — WASSHA SACCOS" }] }),
  component: EscalationsPage,
});

type Escalation = {
  id: string;
  category: string;
  notes: string;
  status: string;
  target_stage: string | null;
  loan_id: string | null;
  raised_by: string;
  resolution: string | null;
  created_at: string;
};

function EscalationsPage() {
  const [rows, setRows] = useState<Escalation[]>([]);
  const [filter, setFilter] = useState("open");
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    let q = supabase.from("assistant_escalations").select("*").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(friendlyError(error));
    else setRows((data as Escalation[]) ?? []);
  }, [filter]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("escalations")
      .on("postgres_changes", { event: "*", schema: "public", table: "assistant_escalations" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const update = async (id: string, patch: { status?: string; resolution?: string | null }) => {
    const { error } = await supabase.from("assistant_escalations").update(patch as never).eq("id", id);
    if (error) toast.error(friendlyError(error));
    else toast.success("Updated");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Assistant Escalations</h1>
            <p className="text-sm text-muted-foreground">Cases routed by the AI assistant into the staff queue.</p>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </header>

        {rows.length === 0 && (
          <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            No escalations.
          </div>
        )}

        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{e.category}</Badge>
                {e.target_stage && <Badge variant="outline">{e.target_stage}</Badge>}
                <Badge>{e.status}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.notes}</p>
              {e.loan_id && (
                <Link to="/loans/$loanId" params={{ loanId: e.loan_id }} className="mt-2 inline-block text-xs text-primary underline">
                  Open related loan →
                </Link>
              )}
              {e.status !== "resolved" && e.status !== "dismissed" && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    placeholder="Resolution notes (optional)"
                    value={resolutionDraft[e.id] ?? e.resolution ?? ""}
                    onChange={(ev) => setResolutionDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {e.status === "open" && (
                      <Button size="sm" variant="secondary" onClick={() => update(e.id, { status: "in_progress" })}>
                        Take
                      </Button>
                    )}
                    <Button size="sm" onClick={() => update(e.id, { status: "resolved", resolution: resolutionDraft[e.id] ?? null })}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => update(e.id, { status: "dismissed", resolution: resolutionDraft[e.id] ?? null })}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
              {e.resolution && (
                <p className="mt-2 rounded bg-muted p-2 text-xs">Resolution: {e.resolution}</p>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
