import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, drawFooter, makeDoc } from "./pdf";

export function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  triggerDownload(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export function downloadXLSX(filename: string, rows: Record<string, any>[], sheet = "Report") {
  const ws = XLSX.utils.json_to_sheet(rows);
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
      body: rows.map((r) => headers.map((h) => (r[h] == null ? "" : String(r[h])))),
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
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export { makeDoc };
