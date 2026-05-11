import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCSV, downloadXLSX, downloadPDF } from "@/lib/exporters";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, FileDown, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — Admin" }] }),
  component: ReportsPage,
});

type ReportType = "loans" | "transactions" | "audit_log";

function ReportsPage() {
  const { hasRole, loading } = useAuth();
  const [type, setType] = useState<ReportType>("loans");
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState("all");
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const fetchRows = async () => {
    setBusy(true);
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(new Date(to).getTime() + 86400000).toISOString();
    let q: any = supabase.from(type).select("*").gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: false });
    if (type === "loans" && statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return []; }
    const flat = (data ?? []).map((r: any) => {
      if (type === "audit_log") return {
        date: fmtDate(r.created_at), action: r.action, entity: r.entity, entity_id: r.entity_id, actor: r.actor_id,
      };
      if (type === "loans") return {
        date: fmtDate(r.created_at), loan_number: r.loan_number, member_id: r.member_id,
        amount_requested: r.amount_requested, amount_approved: r.amount_approved,
        stage: r.stage, status: r.status, outstanding: r.outstanding_balance,
      };
      return {
        date: fmtDate(r.created_at), member_id: r.user_id, type: r.tx_type,
        amount: r.amount, description: r.description ?? "",
      };
    });
    setRows(flat);
    return flat;
  };

  const exportAs = async (fmt: "csv" | "xlsx" | "pdf") => {
    const data = rows.length ? rows : await fetchRows();
    if (!data.length) { toast.error("No data to export"); return; }
    const name = `${type}-${from}-${to}`;
    if (fmt === "csv") downloadCSV(`${name}.csv`, data);
    else if (fmt === "xlsx") downloadXLSX(`${name}.xlsx`, data, type);
    else downloadPDF(`${name}.pdf`, `${type.replace("_", " ")} report — ${from} to ${to}`, data);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Reports & exports</h1>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <Label>Report</Label>
              <Select value={type} onValueChange={(v) => { setType(v as ReportType); setRows([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loans">Loans</SelectItem>
                  <SelectItem value="transactions">Contributions / Transactions</SelectItem>
                  <SelectItem value="audit_log">Audit log</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            {type === "loans" && (
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {["pending", "approved", "rejected", "disbursed", "completed"].map((s) =>
                      <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-end">
              <Button onClick={fetchRows} disabled={busy} className="w-full">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => exportAs("csv")} variant="outline" size="sm">
              <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={() => exportAs("xlsx")} variant="outline" size="sm">
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button onClick={() => exportAs("pdf")} className="bg-[image:var(--gradient-primary)] text-primary-foreground" size="sm">
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 text-primary" /> Preview ({rows.length} rows)
            </h2>
          </div>
          {rows.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">Run the report to preview rows.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    {Object.keys(rows[0]).map((k) => <th key={k} className="py-2 pr-4">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-border/40">
                      {Object.values(r).map((v: any, j) => (
                        <td key={j} className="py-2 pr-4 text-xs">{v == null ? "—" : String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <p className="mt-3 text-xs text-muted-foreground">Showing 50 of {rows.length}. Export to see everything.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
