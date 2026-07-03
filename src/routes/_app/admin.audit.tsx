import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCSV, downloadPDF } from "@/lib/exporters";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { FileSpreadsheet, FileDown, ShieldCheck, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log — Admin" }] }),
  component: AuditPage,
});

const PAGE_SIZE = 25;

function AuditPage() {
  const { hasRole, loading } = useAuth();
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const fetchRows = async () => {
    setBusy(true);
    let q = supabase.from("audit_log").select("*")
      .gte("created_at", new Date(from).toISOString())
      .lt("created_at", new Date(new Date(to).getTime() + 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);
    if (action !== "all") q = q.eq("action", action);
    if (entity !== "all") q = q.eq("entity", entity);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return []; }
    let flat = (data ?? []).map((r: any) => ({
      date: fmtDate(r.created_at),
      action: r.action,
      entity: r.entity,
      summary: r.meta?.summary ?? "—",
      actor: r.meta?.actor_name ?? "—",
      actor_no: r.meta?.actor_member_no ?? "—",
      roles: r.meta?.actor_roles ?? "—",
      entity_id: r.entity_id,
    }));
    if (search.trim()) {
      const s = search.toLowerCase();
      flat = flat.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
    }
    setRows(flat);
    setPage(1);
    return flat;
  };

  const exportAs = async (fmt: "csv" | "pdf") => {
    const data = rows.length ? rows : await fetchRows();
    if (!data.length) return toast.error("No rows to export");
    const name = `audit-${from}-${to}`;
    if (fmt === "csv") downloadCSV(`${name}.csv`, data);
    else downloadPDF(`${name}.pdf`, `Audit log — ${from} to ${to}`, data);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> Audit log</h1>
          <p className="text-sm text-muted-foreground">Compliance trail for all sensitive system events.</p>
        </div>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="grid gap-3 md:grid-cols-6">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div>
              <Label>Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all", "INSERT", "UPDATE", "DELETE"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all", "loans", "user_roles", "loan_policies", "transactions"].map((e) =>
                    <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Search</Label><Input placeholder="Free-text" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={fetchRows} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run</Button>
            <Button onClick={() => exportAs("csv")} variant="outline" size="sm"><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
            <Button onClick={() => exportAs("pdf")} size="sm" className="bg-[image:var(--gradient-primary)] text-primary-foreground"><FileDown className="mr-2 h-4 w-4" />PDF</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">{rows.length} entries</h2>
          {rows.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">Run the report to see audit entries.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    {Object.keys(rows[0]).map((k) => <th key={k} className="py-2 pr-3">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-border/40">
                      {Object.values(r).map((v: any, j) => (
                        <td key={j} className="py-2 pr-3 text-xs">{v == null ? "—" : String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <p className="mt-3 text-xs text-muted-foreground">Showing 100 of {rows.length}. Export to see everything.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
