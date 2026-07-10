import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, drawFooter, makeDoc } from "./pdf";

// Neutralize spreadsheet formula injection: any cell whose textual value starts with
// =, +, -, @, tab or CR is a formula/DDE candidate in Excel/Sheets. Prefix with a
// single quote so the receiving app treats it as literal text.
function sanitizeCell(v: any): string {
  const s = v == null ? "" : String(v);
  if (s.length === 0) return s;
  const c = s.charCodeAt(0);
  // '=' 61, '+' 43, '-' 45, '@' 64, tab 9, CR 13, LF 10
  if (c === 61 || c === 43 || c === 45 || c === 64 || c === 9 || c === 13 || c === 10) {
    return "'" + s;
  }
  return s;
}

export function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = sanitizeCell(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  triggerDownload(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export function downloadXLSX(filename: string, rows: Record<string, any>[], sheet = "Report") {
  const safeRows = rows.map((r) => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(r)) out[k] = sanitizeCell(r[k]);
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(safeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename);
}

export function downloadPDF(filename: string, title: string, rows: Record<string, any>[]) {
  const doc = makeDoc();
  const startY = drawBrandHeader(doc, { title, subtitle: `${rows.length} record(s)` });
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    autoTable(doc, {
      startY,
      head: [headers],
      body: rows.map((r) => headers.map((h) => sanitizeCell(r[h]))),
      headStyles: { fillColor: [30, 41, 84], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
    });
  }
  drawFooter(doc);
  doc.save(filename);
}

function triggerDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { makeDoc };
