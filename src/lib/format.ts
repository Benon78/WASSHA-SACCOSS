export const fmtTZS = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return "TZS " + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export const fmtPeriod = (from: string | Date, to: string | Date) => {
  const f = new Date(from);
  const t = new Date(to);
  const sameYear = f.getFullYear() === t.getFullYear();
  const fStr = f.toLocaleDateString("en-US", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
  const tStr = t.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  return `${fStr} – ${tStr}`;
};

export const fmtRelative = (d: string | Date) => {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
