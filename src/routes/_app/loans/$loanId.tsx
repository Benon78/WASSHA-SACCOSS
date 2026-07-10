import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LoanWorkflowTimeline } from "@/components/LoanWorkflowTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtTZS, fmtDate, fmtRelative } from "@/lib/format";
import {
  STAGE_LABEL,
  STAGE_ROLE,
  STAGE_BOARD_SEAT,
  nextStage,
  type LoanStage,
} from "@/lib/loanStages";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileQuestion,
  Upload,
  FileText,
  Loader2,
  Banknote,
  FileDown,
  Eye,
  ReceiptText,
} from "lucide-react";
import { loanRepaymentPdf, disbursementReceiptPdf } from "@/lib/pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LOAN_TYPE_LABEL } from "@/lib/loanStages";

export const Route = createFileRoute("/_app/loans/$loanId")({
  head: () => ({ meta: [{ title: "Loan details — WASSHA SACCOS" }] }),
  component: LoanDetail,
});

function LoanDetail() {
  const { loanId } = useParams({ from: "/_app/loans/$loanId" });
  const { user, roles, boardSeats, isStaff } = useAuth();
  const [loan, setLoan] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [hasProxy, setHasProxy] = useState(false);
  const [comment, setComment] = useState("");
  const [approveAmt, setApproveAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);

  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    const [l, a, d] = await Promise.all([
      supabase.from("loans").select("*").eq("id", loanId).maybeSingle(),
      supabase
        .from("loan_approvals")
        .select("*")
        .eq("loan_id", loanId)
        .order("created_at", { ascending: false }),
      supabase
        .from("loan_documents")
        .select("*")
        .eq("loan_id", loanId)
        .order("created_at", { ascending: false }),
    ]);
    if (!l.data) {
      setNotFound(true);
      return;
    }
    setLoan(l.data);
    setApprovals(a.data ?? []);
    setDocs(d.data ?? []);
    if (l.data?.amount_approved) setApproveAmt(String(l.data.amount_approved));
    else if (l.data?.amount_requested) setApproveAmt(String(l.data.amount_requested));

    // Check for active proxy delegation for the current user at the current stage.
    if (user) {
      const { data: px } = await supabase
        .from("loan_proxies")
        .select("id, expires_at, consumed_at, revoked_at")
        .eq("loan_id", loanId)
        .eq("stage", l.data.stage)
        .eq("delegate_id", user.id)
        .is("consumed_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      setHasProxy(!!px);
    } else {
      setHasProxy(false);
    }
  };

  useEffect(() => {
    load();
  }, [loanId, user?.id]);

  useEffect(() => {
    if (notFound) {
      toast.error("This loan no longer exists.");
      const t = setTimeout(() => {
        window.location.href = "/loans";
      }, 800);
      return () => clearTimeout(t);
    }
  }, [notFound]);

  if (notFound)
    return (
      <div className="min-h-screen bg-muted/30">
        <AppHeader />
        <div className="container mx-auto p-12 text-center text-muted-foreground">
          Loan not found — redirecting to your loans…
        </div>
      </div>
    );
  if (!loan)
    return (
      <div className="min-h-screen bg-muted/30">
        <AppHeader />
        <div className="container mx-auto p-12 text-center text-muted-foreground">Loading…</div>
      </div>
    );

  const stage = loan.stage as LoanStage;
  const requiredRole = STAGE_ROLE[stage];
  const requiredSeat = STAGE_BOARD_SEAT[stage];
  const isOwner = user?.id === loan.member_id;
  // Conflict-of-interest: a staff member cannot act on their own loan application.
  const hasStageAuthority =
    (requiredRole && roles.includes(requiredRole)) ||
    (requiredSeat && boardSeats.includes(requiredSeat)) ||
    hasProxy;
  const canActOnStage = isStaff && hasStageAuthority && !isOwner;
  const isManager = roles.includes("manager");
  const canConfirmDisbursement =
    isManager && stage === "disbursement" && !isOwner && !loan.disbursement_confirmed_at;
  const uploadsLocked =
    ["disbursement", "completed", "rejected"].includes(loan.stage) ||
    ["disbursed", "completed", "rejected"].includes(loan.status);

  const recordApproval = async (
    decision: "approved" | "rejected" | "forwarded" | "docs_requested",
  ) => {
    if (!user) return;
    setBusy(true);
    try {
      const { error: aErr } = await supabase.from("loan_approvals").insert({
        loan_id: loanId,
        stage,
        approver_id: user.id,
        decision,
        comment: comment || null,
      });
      if (aErr) throw aErr;

      const updates: any = {};
      if (decision === "approved" || decision === "forwarded") {
        const ns = nextStage(stage);
        updates.stage = ns;
        if (ns === "disbursement") {
          updates.status = "approved";
          updates.amount_approved = Number(approveAmt) || loan.amount_requested;
          // outstanding_balance and fee are set by rpc_confirm_disbursement when the Manager disburses.
        }

        // Note: completion is now driven by repayments, not by stage transition.
      } else if (decision === "rejected") {
        updates.status = "rejected";
        updates.stage = "rejected";
      }
      if (Object.keys(updates).length) {
        const { error: uErr } = await supabase.from("loans").update(updates).eq("id", loanId);
        if (uErr) throw uErr;
      }
      toast.success(`Recorded: ${decision.replace("_", " ")}`);
      setComment("");
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

  const uploadMore = async () => {
    if (!user || uploadFiles.length === 0) return;
    if (uploadsLocked) {
      toast.error("Documents cannot be uploaded once the loan reaches disbursement.");
      return;
    }
    setBusy(true);
    try {
      for (const f of uploadFiles) {
        if (!ALLOWED_MIME.has(f.type)) {
          toast.error(`${f.name}: only PDF, JPG, PNG, WEBP allowed`);
          continue;
        }
        const path = `${user.id}/${loanId}/${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("loan-documents").upload(path, f);
        if (error) {
          toast.error(`Failed: ${f.name}`);
          continue;
        }
        await supabase.from("loan_documents").insert({
          loan_id: loanId,
          file_path: path,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          uploaded_by: user.id,
        });
      }
      toast.success("Documents uploaded");
      setUploadFiles([]);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const previewDoc = async (d: any) => {
    const { data } = await supabase.storage
      .from("loan-documents")
      .createSignedUrl(d.file_path, 300);
    if (data?.signedUrl)
      setPreview({ url: data.signedUrl, name: d.file_name, mime: d.mime_type || "" });
  };

  const downloadReceipt = async () => {
    const [{ data: prof }, { data: tx }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", loan.member_id).maybeSingle(),
      supabase
        .from("transactions")
        .select("*")
        .eq("loan_id", loanId)
        .eq("tx_type", "disbursement")
        .maybeSingle(),
    ]);
    const doc = disbursementReceiptPdf({
      header: {
        title: "Disbursement Receipt",
        subtitle: loan.loan_number,
        memberName: prof?.full_name ?? undefined,
        memberNumber: prof?.member_number ?? undefined,
      },
      loan,
      disbursementTx: tx as any,
      approvals: [...approvals].reverse(),
    });
    doc.save(`${loan.loan_number}-receipt.pdf`);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{loan.loan_number}</h1>
            <p className="text-sm text-muted-foreground">Submitted {fmtDate(loan.created_at)}</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl bg-card px-4 py-2 shadow-[var(--shadow-card)]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Requested
              </p>
              <p className="text-base font-bold">{fmtTZS(loan.amount_requested)}</p>
            </div>
            {loan.amount_approved && (
              <div className="rounded-xl bg-card px-4 py-2 shadow-[var(--shadow-card)]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Approved
                </p>
                <p className="text-base font-bold text-success">{fmtTZS(loan.amount_approved)}</p>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { data: prof } = await supabase
                  .from("profiles")
                  .select("*")
                  .eq("user_id", loan.member_id)
                  .maybeSingle();
                const { data: rep } = await supabase
                  .from("transactions")
                  .select("*")
                  .eq("loan_id", loanId)
                  .eq("tx_type", "repayment")
                  .order("created_at", { ascending: true });
                const doc = loanRepaymentPdf({
                  header: {
                    title: "Loan Statement",
                    subtitle: loan.loan_number,
                    memberName: prof?.full_name ?? undefined,
                    memberNumber: prof?.member_number ?? undefined,
                  },
                  loan,
                  repayments: rep ?? [],
                });
                doc.save(`${loan.loan_number}.pdf`);
              }}
            >
              <FileDown className="mr-2 h-4 w-4" /> Statement
            </Button>
            {(loan.status === "disbursed" || loan.stage === "completed") && (
              <Button
                size="sm"
                onClick={downloadReceipt}
                className="bg-[image:var(--gradient-primary)] text-primary-foreground"
              >
                <ReceiptText className="mr-2 h-4 w-4" /> Receipt
              </Button>
            )}
          </div>
        </div>

        <LoanWorkflowTimeline
          currentStage={stage}
          status={loan.status}
          loanNumber={loan.loan_number}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-base font-semibold">Application details</h3>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Loan type</dt>
                  <dd className="font-medium">
                    {LOAN_TYPE_LABEL[loan.loan_type] ?? loan.loan_type ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Term</dt>
                  <dd className="font-medium">{loan.term_months} months</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Interest rate</dt>
                  <dd className="font-medium">{loan.interest_rate}% p.a.</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Approved amount</dt>
                  <dd className="font-medium">{fmtTZS(loan.amount_approved ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Loan fee</dt>
                  <dd className="font-medium">{fmtTZS(loan.fee_amount ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Amount repaid (principal)</dt>
                  <dd className="font-medium">
                    {fmtTZS(
                      Math.max(
                        0,
                        Number(loan.amount_approved ?? 0) - Number(loan.outstanding_balance ?? 0),
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding principal</dt>
                  <dd className="font-medium">{fmtTZS(loan.outstanding_balance)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding fee</dt>
                  <dd className="font-medium">{fmtTZS(loan.fee_outstanding ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total outstanding</dt>
                  <dd className="font-semibold text-foreground">
                    {fmtTZS(
                      Number(loan.outstanding_balance ?? 0) + Number(loan.fee_outstanding ?? 0),
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium capitalize">{loan.status}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stage</dt>
                  <dd className="font-medium">{STAGE_LABEL[stage] ?? stage}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Purpose</dt>
                  <dd className="font-medium">{loan.purpose}</dd>
                </div>
              </dl>
            </section>

            {/* Staff actions */}
            {isStaff && hasStageAuthority && isOwner && (
              <section className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning-foreground">
                You cannot act on your own loan. Another authorised approver must review this
                application.
              </section>
            )}
            {canActOnStage && (
              <section className="rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-[var(--shadow-card)]">
                <h3 className="text-base font-semibold">
                  Action required at: {STAGE_LABEL[stage]}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {hasProxy
                    ? "You are acting as a delegated proxy for this stage (one-time use)."
                    : "You have authority to act on this stage."}
                </p>
                {nextStage(stage) === "disbursement" && (
                  <div className="mt-4 space-y-1.5">
                    <Label>Approved amount (TZS)</Label>
                    <Input
                      type="number"
                      value={approveAmt}
                      onChange={(e) => setApproveAmt(e.target.value)}
                    />
                  </div>
                )}
                <div className="mt-4 space-y-1.5">
                  <Label>Comment</Label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Reasoning, conditions, or documents needed..."
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => recordApproval("approved")}
                    disabled={busy}
                    className="bg-success text-success-foreground hover:bg-success/90"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve & advance
                  </Button>
                  <Button
                    onClick={() => recordApproval("forwarded")}
                    disabled={busy}
                    variant="outline"
                  >
                    <ArrowRight className="mr-2 h-4 w-4" /> Forward to next stage
                  </Button>
                  <Button
                    onClick={() => recordApproval("docs_requested")}
                    disabled={busy}
                    variant="outline"
                  >
                    <FileQuestion className="mr-2 h-4 w-4" /> Request documents
                  </Button>
                  <Button
                    onClick={() => recordApproval("rejected")}
                    disabled={busy}
                    variant="destructive"
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </div>
              </section>
            )}

            {/* Manager: confirm disbursement */}
            {canConfirmDisbursement && (
              <section className="rounded-2xl border-2 border-success/40 bg-success/5 p-6 shadow-[var(--shadow-card)]">
                <h3 className="text-base font-semibold">Disburse loan</h3>
                <p className="text-xs text-muted-foreground">
                  Release {fmtTZS(loan.amount_approved ?? loan.amount_requested)} to the member. The
                  system will calculate the loan fee from the current policy, deposit the principal
                  into the member's account, and mark the loan active. Completion happens
                  automatically once principal and fee are fully repaid.
                </p>
                <Button
                  className="mt-4 bg-success text-success-foreground hover:bg-success/90"
                  disabled={busy}
                  onClick={async () => {
                    if (!user) return;
                    if (!confirm("Disburse this loan and credit the member's account?")) return;
                    setBusy(true);
                    try {
                      const { error } = await supabase.rpc("rpc_confirm_disbursement", {
                        _loan_id: loanId,
                      });
                      if (error) throw error;
                      toast.success(
                        "Loan successfully disbursed. The approved amount has been deposited into the member's account. The loan is now active and repayments have begun.",
                      );
                      await load();
                    } catch (e: any) {
                      toast.error(friendlyError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Banknote className="mr-2 h-4 w-4" /> Disburse loan
                </Button>
              </section>
            )}

            {/* Documents */}
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-base font-semibold">Documents</h3>
              {docs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border/60">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <button
                            onClick={() => previewDoc(d)}
                            className="text-sm font-medium hover:text-primary"
                          >
                            {d.file_name}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {(d.file_size / 1024).toFixed(0)} KB · {fmtDate(d.created_at)}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => previewDoc(d)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {(isOwner || isStaff) && !uploadsLocked && (
                <div className="mt-4 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm transition hover:bg-muted/50">
                    <Upload className="h-4 w-4" /> Upload more documents (PDF, JPG, PNG, WEBP)
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                      className="hidden"
                    />
                  </label>
                  {uploadFiles.length > 0 && (
                    <Button onClick={uploadMore} disabled={busy} size="sm">
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Upload {uploadFiles.length} file(s)
                    </Button>
                  )}
                </div>
              )}
              {uploadsLocked && (isOwner || isStaff) && (
                <p className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
                  Document uploads are locked once the loan reaches disbursement.
                </p>
              )}
            </section>
          </div>

          {/* Audit trail */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-base font-semibold">Approval history</h3>
            {approvals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No actions yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {approvals.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        a.decision === "approved"
                          ? "bg-success/15 text-success"
                          : a.decision === "rejected"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-primary/15 text-primary"
                      }`}
                    >
                      {a.decision === "approved" ? "✓" : a.decision === "rejected" ? "✕" : "→"}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize">
                        {a.decision.replace("_", " ")} at {STAGE_LABEL[a.stage as LoanStage]}
                      </p>
                      {a.comment && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{a.comment}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {fmtRelative(a.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview &&
            (preview.mime.startsWith("image/") ? (
              <img
                src={preview.url}
                alt={`Supporting document for loan ${loan.loan_number}: ${preview.name}`}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            ) : (
              <iframe
                src={preview.url}
                title={`Supporting document ${preview.name} for loan ${loan.loan_number}`}
                className="h-[70vh] w-full rounded-lg border"
              />
            ))}
          {preview && (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Open original in new tab
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
