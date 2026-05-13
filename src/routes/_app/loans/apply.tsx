import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtTZS } from "@/lib/format";
import { LOAN_TYPE_LABEL, LOAN_TYPE_DESC, LOAN_TYPE_RULES } from "@/lib/loanStages";
import { toast } from "sonner";
import { Loader2, Upload, X, Briefcase, Zap, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_app/loans/apply")({
  head: () => ({ meta: [{ title: "Apply for a loan — WASSHA SACCOS" }] }),
  component: ApplyPage,
});

const MAX = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TYPE_ICON: Record<string, any> = { development: Briefcase, chapchap: Zap, emergency: AlertCircle };

function ApplyPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [eligibility, setEligibility] = useState<any>(null);
  const [loanType, setLoanType] = useState<"development" | "chapchap" | "emergency">("development");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [term, setTerm] = useState("12");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const rule = LOAN_TYPE_RULES[loanType];

  useEffect(() => {
    if (!user) return;
    supabase.rpc("calculate_eligibility", { _user_id: user.id })
      .then(({ data }) => setEligibility(data));
  }, [user?.id]);

  // Clamp term when switching loan type
  useEffect(() => {
    if (Number(term) > rule.maxTerm) setTerm(String(rule.maxTerm));
  }, [loanType]); // eslint-disable-line

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    const ok: File[] = [];
    for (const f of fs) {
      if (f.size > MAX) { toast.error(`${f.name} exceeds 10MB`); continue; }
      if (!ALLOWED_MIME.has(f.type)) {
        toast.error(`${f.name}: only PDF, JPG, PNG, WEBP allowed`); continue;
      }
      ok.push(f);
    }
    setFiles((prev) => [...prev, ...ok].slice(0, 5));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (eligibility && !eligibility.eligible) return toast.error("You are not currently eligible.");
    if (eligibility && amt > Number(eligibility.max_amount)) {
      return toast.error(`Amount exceeds your limit of ${fmtTZS(eligibility.max_amount)}`);
    }
    setSubmitting(true);
    try {
      const { data: loan, error } = await supabase.from("loans").insert({
        member_id: user.id,
        amount_requested: amt,
        purpose,
        term_months: Number(term),
        loan_type: loanType,
        eligibility_limit: eligibility?.max_amount ?? null,
      }).select().single();
      if (error) throw error;

      for (const f of files) {
        const path = `${user.id}/${loan.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("loan-documents").upload(path, f);
        if (upErr) { toast.error(`Upload failed: ${f.name}`); continue; }
        await supabase.from("loan_documents").insert({
          loan_id: loan.id, file_path: path, file_name: f.name,
          file_size: f.size, mime_type: f.type, uploaded_by: user.id,
        });
      }

      toast.success(`Application ${loan.loan_number} submitted`);
      nav({ to: "/loans/$loanId", params: { loanId: loan.id } });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Apply for a loan</h1>
          <p className="text-sm text-muted-foreground">Submit your loan request and supporting documents.</p>
        </div>

        {eligibility && (
          <div className={`rounded-2xl border p-5 ${eligibility.eligible ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {eligibility.eligible ? "You're eligible to borrow up to" : "You are not eligible right now"}
              </p>
              <p className="text-lg font-bold text-primary">{fmtTZS(eligibility.max_amount)}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Savings: {fmtTZS(eligibility.savings)} · Active loan: {fmtTZS(eligibility.active_loan_balance)} · Member: {eligibility.months_member} months
            </p>
            {!eligibility.eligible && eligibility.reasons?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {eligibility.reasons.map((r: any, i: number) => (
                  <li key={i} className="text-muted-foreground">• {r.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="space-y-2">
            <Label>Loan type</Label>
            <div className="grid gap-2 md:grid-cols-3">
              {(["development", "chapchap", "emergency"] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                const active = loanType === t;
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setLoanType(t)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active ? "border-primary bg-primary/5 shadow-[var(--shadow-card)]" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Icon className={`mb-2 h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <p className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{LOAN_TYPE_LABEL[t]}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{LOAN_TYPE_DESC[t]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (TZS)</Label>
              <Input id="amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="term">Term (months)</Label>
              <Input id="term" type="number" min="1" max="60" value={term} onChange={(e) => setTerm(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purpose">Purpose</Label>
            <Textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required minLength={10} placeholder="Explain how you'll use this loan..." />
          </div>

          <div className="space-y-2">
            <Label>Supporting documents (PDF or images, up to 5 files, 10MB each)</Label>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 transition hover:bg-muted">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to upload files</span>
              <input type="file" multiple accept="application/pdf,image/*" onChange={onPick} className="hidden" />
            </label>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button type="submit" disabled={submitting || (eligibility && !eligibility.eligible)}
            className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit application
          </Button>
        </form>
      </div>
    </div>
  );
}
