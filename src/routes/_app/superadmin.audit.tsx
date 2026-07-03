import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAuditEvents,
  getAuditDetail,
  exportAuditCsv,
} from "@/lib/superadmin-security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Activity, ChevronLeft, ChevronRight, Download, Eye, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/audit")({
  head: () => ({ meta: [{ title: "Audit Center — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: AuditPage,
});

type Filters = {
  page: number;
  pageSize: number;
  entity?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
};

function AuditPage() {
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: 50 });
  const [detailId, setDetailId] = useState<string | null>(null);

  const q = useQuery(
    queryOptions({
      queryKey: ["superadmin", "audit", filters],
      queryFn: () => listAuditEvents({ data: filters }),
      staleTime: 15_000,
    }),
  );

  const exportFn = useServerFn(exportAuditCsv);
  const exportMut = useMutation({
    mutationFn: async (password: string) =>
      exportFn({
        data: {
          password,
          entity: filters.entity,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          limit: 5000,
        },
      }),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 19)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.rows} rows`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed"),
  });

  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Audit center</h1>
        <p className="text-sm text-muted-foreground">
          Immutable ledger of every privileged action. Records are append-only — even super admins cannot alter or
          delete rows. Export is itself audited.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label>Search summary</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="e.g. suspended user"
                value={filters.search ?? ""}
                onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined, page: 1 })}
              />
            </div>
          </div>
          <div>
            <Label>Entity</Label>
            <Input
              placeholder="e.g. loans"
              value={filters.entity ?? ""}
              onChange={(e) => setFilters({ ...filters, entity: e.target.value || undefined, page: 1 })}
            />
          </div>
          <div>
            <Label>From</Label>
            <Input
              type="datetime-local"
              onChange={(e) =>
                setFilters({
                  ...filters,
                  fromDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  page: 1,
                })
              }
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="datetime-local"
              onChange={(e) =>
                setFilters({
                  ...filters,
                  toDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  page: 1,
                })
              }
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <ConfirmWithPassword
            title="Export audit rows"
            description="Export the currently-filtered audit rows (up to 5,000). The export itself is audited."
            actionLabel="Export"
            trigger={
              <Button variant="outline" disabled={exportMut.isPending}>
                {exportMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export CSV
              </Button>
            }
            onConfirmed={async (pw) => { await exportMut.mutateAsync(pw); }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Audit events
          {q.data && <Badge variant="outline" className="ml-2 text-xs">{q.data.total.toLocaleString()} rows</Badge>}
        </h2>

        {q.isLoading ? (
          <PageLoader label="Loading audit events…" />
        ) : q.error || !q.data ? (
          <ErrorState onRetry={q.refetch} title="Failed to load audit events" />
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Time</th>
                    <th className="pr-3">Actor</th>
                    <th className="pr-3">Action</th>
                    <th className="pr-3">Entity</th>
                    <th className="pr-3">Summary</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.rows.map((r) => {
                    const summary = (r.meta as { summary?: string } | null)?.summary ?? "";
                    return (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                        <td className="pr-3 text-xs">{r.actor?.full_name ?? <span className="text-muted-foreground">system</span>}</td>
                        <td className="pr-3"><Badge variant="secondary" className="font-mono text-[10px]">{r.action}</Badge></td>
                        <td className="pr-3 text-xs">{r.entity}</td>
                        <td className="pr-3 text-xs max-w-[420px] truncate" title={summary}>{summary || "—"}</td>
                        <td>
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {q.data.rows.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No matching events.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {q.data.page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={q.data.page <= 1} onClick={() => setFilters({ ...filters, page: q.data!.page - 1 })}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button size="sm" variant="outline" disabled={q.data.page >= totalPages} onClick={() => setFilters({ ...filters, page: q.data!.page + 1 })}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <AuditDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function AuditDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["superadmin", "audit-detail", id],
    queryFn: () => getAuditDetail({ data: { id: id! } }),
    enabled: !!id,
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit event</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <PageLoader label="Loading event…" />
        ) : !q.data ? (
          <p className="text-sm text-muted-foreground">Not found.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Time" value={fmtDate(q.data.created_at)} />
            <Row label="Actor" value={q.data.actor?.full_name ?? "system"} />
            <Row label="Action" value={<code className="font-mono text-xs">{q.data.action}</code>} />
            <Row label="Entity" value={`${q.data.entity}${q.data.entity_id ? " · " + q.data.entity_id : ""}`} />
            <Row label="IP" value={q.data.ip ?? "—"} />
            <Row label="User agent" value={q.data.user_agent ?? "—"} />
            {q.data.prev_value !== null && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Previous value</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px]">{JSON.stringify(q.data.prev_value, null, 2)}</pre>
              </div>
            )}
            {q.data.new_value !== null && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">New value</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px]">{JSON.stringify(q.data.new_value, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="col-span-2 break-all">{value}</span>
    </div>
  );
}
