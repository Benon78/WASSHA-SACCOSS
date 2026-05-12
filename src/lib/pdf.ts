import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtTZS, fmtDate } from "./format";

export interface PdfHeader {
  title: string;
  subtitle?: string;
  memberName?: string;
  memberNumber?: string;
  periodLabel?: string;
}

const ORANGE: [number, number, number] = [245, 130, 32];
const NAVY: [number, number, number] = [30, 41, 84];

export function makeDoc() {
  return new jsPDF({ unit: "pt", format: "a4" });
}

export function drawBrandHeader(doc: jsPDF, h: PdfHeader) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 70, doc.internal.pageSize.getWidth(), 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("WASSHA SACCOS", 40, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Savings & Loans Cooperative", 40, 46);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, doc.internal.pageSize.getWidth() - 40, 30, { align: "right" });

  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(h.title, 40, 110);
  if (h.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(h.subtitle, 40, 126);
  }
  let y = 145;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (h.memberName) { doc.text(`Member: ${h.memberName}`, 40, y); y += 12; }
  if (h.memberNumber) { doc.text(`Member #: ${h.memberNumber}`, 40, y); y += 12; }
  if (h.periodLabel) { doc.text(`Period: ${h.periodLabel}`, 40, y); y += 12; }
  return y + 6;
}

export function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text("WASSHA SACCOS · Confidential", 40, h - 24);
    doc.text(`Page ${i} of ${pages}`, w - 40, h - 24, { align: "right" });
  }
}

export function savingsStatementPdf(opts: {
  header: PdfHeader;
  txs: Array<{ created_at: string; tx_type: string; description: string | null; amount: number }>;
  openingBalance: number;
  closingBalance: number;
}) {
  const doc = makeDoc();
  const startY = drawBrandHeader(doc, opts.header);
  let running = opts.openingBalance;
  const isCredit = (t: string) => ["deposit", "contribution", "disbursement"].includes(t);
  const rows = opts.txs.map((tx) => {
    const credit = isCredit(tx.tx_type) ? Number(tx.amount) : 0;
    const debit = !isCredit(tx.tx_type) ? Number(tx.amount) : 0;
    running += credit - debit;
    return [
      fmtDate(tx.created_at),
      tx.tx_type.replace("_", " "),
      tx.description || "—",
      credit ? fmtTZS(credit) : "",
      debit ? fmtTZS(debit) : "",
      fmtTZS(running),
    ];
  });
  autoTable(doc, {
    startY,
    head: [["Date", "Type", "Description", "Credit", "Debit", "Balance"]],
    body: rows,
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: {
      3: { halign: "right", textColor: [22, 130, 50] },
      4: { halign: "right", textColor: [180, 30, 30] },
      5: { halign: "right", fontStyle: "bold" },
    },
  });
  const finalY = (doc as any).lastAutoTable.finalY + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(`Opening balance: ${fmtTZS(opts.openingBalance)}`, 40, finalY);
  doc.text(`Closing balance: ${fmtTZS(opts.closingBalance)}`, 40, finalY + 14);
  drawFooter(doc);
  return doc;
}

export function loanRepaymentPdf(opts: {
  header: PdfHeader;
  loan: any;
  repayments: Array<{ created_at: string; amount: number; description: string | null }>;
}) {
  const doc = makeDoc();
  const startY = drawBrandHeader(doc, opts.header);
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  const left = [
    `Loan #: ${opts.loan.loan_number}`,
    `Approved amount: ${fmtTZS(opts.loan.amount_approved || opts.loan.amount_requested)}`,
    `Interest rate: ${opts.loan.interest_rate}% p.a.`,
    `Term: ${opts.loan.term_months} months`,
    `Outstanding: ${fmtTZS(opts.loan.outstanding_balance)}`,
    `Status: ${opts.loan.status}`,
  ];
  left.forEach((l, i) => doc.text(l, 40, startY + i * 14));
  const tableY = startY + left.length * 14 + 10;
  autoTable(doc, {
    startY: tableY,
    head: [["Date", "Description", "Amount paid"]],
    body: opts.repayments.map((r) => [fmtDate(r.created_at), r.description || "Repayment", fmtTZS(r.amount)]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 2: { halign: "right", fontStyle: "bold" } },
  });
  drawFooter(doc);
  return doc;
}

export function disbursementReceiptPdf(opts: {
  header: PdfHeader;
  loan: any;
  disbursementTx: { id: string; created_at: string; amount: number } | null;
  approvals: Array<{ stage: string; decision: string; comment: string | null; created_at: string }>;
}) {
  const doc = makeDoc();
  const startY = drawBrandHeader(doc, { ...opts.header, title: "Disbursement Receipt" });
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  const tx = opts.disbursementTx;
  const lines = [
    `Loan #: ${opts.loan.loan_number}`,
    `Loan type: ${opts.loan.loan_type ?? "development"}`,
    `Disbursed amount: ${fmtTZS(opts.loan.amount_approved || opts.loan.amount_requested)}`,
    `Interest rate: ${opts.loan.interest_rate}% p.a.`,
    `Term: ${opts.loan.term_months} months`,
    `Outstanding balance: ${fmtTZS(opts.loan.outstanding_balance)}`,
    `Status: ${opts.loan.status}`,
    `Transaction reference: ${tx?.id ?? "—"}`,
    `Disbursed on: ${tx ? fmtDate(tx.created_at) : "—"}`,
  ];
  lines.forEach((l, i) => doc.text(l, 40, startY + i * 14));
  const tableY = startY + lines.length * 14 + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Approval timeline", 40, tableY);

  autoTable(doc, {
    startY: tableY + 6,
    head: [["Date", "Stage", "Decision", "Comment"]],
    body: opts.approvals.map((a) => [
      fmtDate(a.created_at),
      a.stage.replace("_", " "),
      a.decision.replace("_", " "),
      a.comment || "—",
    ]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("This document confirms the disbursement of the above loan.", 40, finalY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.text("Repayments will be applied to this loan only and do not affect your savings balance.", 40, finalY + 14);
  drawFooter(doc);
  return doc;
}
