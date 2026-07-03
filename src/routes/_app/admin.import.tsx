import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportMembers, type BulkMemberRow, type BulkImportResult } from "@/lib/bulk-members.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/admin/import")({
  head: () => pageHead({
    path: "/admin/import",
    title: "Bulk member import — Admin",
    description: "Import member profile updates from a CSV file.",
    noIndex: true,
  }),
  component: ImportPage,
});

const SAMPLE = `email,member_number,full_name,phone,joined_at,opening_balance
member@example.com,M-0001,John Doe,+255700000000,2024-01-15,50000`;

// Simple CSV parser: handles quoted fields with commas.
function parseCsv(text: string): BulkMemberRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows: BulkMemberRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = split(lines[i]);
    const rec: any = {};
    headers.forEach((h, idx) => { rec[h] = vals[idx] ?? ""; });
    rows.push(rec);
  }
  return rows;
}

function ImportPage() {
  const { hasRole, loading } = useAuth();
  const runImport = useServerFn(bulkImportMembers);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkMemberRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const onFile = async (f: File) => {
    setFile(f);
    setResult(null);
    try {
      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("CSV appears empty or missing headers");
      if (!("email" in rows[0])) throw new Error("CSV must include an 'email' column");
      setPreview(rows);
    } catch (e: any) {
      toast.error(e.message ?? "Could not parse CSV");
      setPreview([]);
    }
  };

  const submit = async () => {
    if (preview.length === 0) return;
    setBusy(true);
    try {
      const res = await runImport({ data: { rows: preview } });
      setResult(res);
      toast.success(`Import complete: ${res.updated} updated`);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Upload className="h-6 w-6 text-primary" /> Bulk member import</h1>
          <p className="text-sm text-muted-foreground">
            Upload a CSV to update existing member profiles. Members are matched by email — new accounts must still self-register or use the invite flow.
          </p>
        </div>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> Expected columns</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Required: <code className="rounded bg-muted px-1">email</code>. Optional:{" "}
            <code className="rounded bg-muted px-1">member_number</code>, <code className="rounded bg-muted px-1">full_name</code>,{" "}
            <code className="rounded bg-muted px-1">phone</code>, <code className="rounded bg-muted px-1">joined_at</code> (YYYY-MM-DD),{" "}
            <code className="rounded bg-muted px-1">opening_balance</code>. Max 1000 rows per file.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-3 text-xs">{SAMPLE}</pre>
          <a
            href={"data:text/csv;charset=utf-8," + encodeURIComponent(SAMPLE)}
            download="member-import-template.csv"
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Download template
          </a>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <label className="block">
            <span className="text-sm font-semibold">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-2 block w-full text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>

          {preview.length > 0 && (
            <>
              <p className="mt-4 text-sm text-muted-foreground">
                Parsed <strong>{preview.length}</strong> row(s) from <span className="font-mono">{file?.name}</span>. Preview (first 5):
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Email</th><th className="pr-3">Member #</th><th className="pr-3">Name</th>
                      <th className="pr-3">Phone</th><th className="pr-3">Joined</th><th>Opening bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="py-1.5 pr-3">{r.email}</td>
                        <td className="pr-3">{r.member_number || "—"}</td>
                        <td className="pr-3">{r.full_name || "—"}</td>
                        <td className="pr-3">{r.phone || "—"}</td>
                        <td className="pr-3">{r.joined_at || "—"}</td>
                        <td>{r.opening_balance ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={submit} disabled={busy} className="mt-4 bg-[image:var(--gradient-primary)] text-primary-foreground">
                {busy ? "Importing…" : `Import ${preview.length} row(s)`}
              </Button>
            </>
          )}
        </section>

        {result && (
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">Import result</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> {result.updated} profile(s) updated</div>
              {result.notFound.length > 0 && (
                <details className="rounded border border-warning/40 bg-warning/5 p-3">
                  <summary className="cursor-pointer text-warning-foreground">
                    <AlertCircle className="mr-1 inline h-4 w-4 text-warning" />
                    {result.notFound.length} email(s) had no existing member account
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {result.notFound.map((e) => (<li key={e} className="font-mono">{e}</li>))}
                  </ul>
                </details>
              )}
              {result.errors.length > 0 && (
                <details className="rounded border border-destructive/40 bg-destructive/5 p-3">
                  <summary className="cursor-pointer text-destructive">
                    {result.errors.length} row(s) failed
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {result.errors.map((e, i) => (<li key={i}><span className="font-mono">{e.email}</span> — {e.error}</li>))}
                  </ul>
                </details>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
