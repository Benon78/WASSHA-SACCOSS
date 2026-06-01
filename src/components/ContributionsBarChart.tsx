import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string; title?: string }

export function ContributionsBarChart({ userId, title = "Contributions & deposits" }: Props) {
  const [data, setData] = useState<{ m: string; deposit: number; contribution: number }[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
      const { data: rows } = await supabase
        .from("transactions")
        .select("amount, tx_type, created_at")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .in("tx_type", ["deposit", "contribution"]);
      const buckets: Record<string, { deposit: number; contribution: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const k = d.toLocaleString(undefined, { month: "short" });
        buckets[k] = { deposit: 0, contribution: 0 };
      }
      (rows ?? []).forEach((r: any) => {
        const k = new Date(r.created_at).toLocaleString(undefined, { month: "short" });
        if (!buckets[k]) buckets[k] = { deposit: 0, contribution: 0 };
        buckets[k][r.tx_type as "deposit" | "contribution"] += Number(r.amount);
      });
      setData(Object.entries(buckets).map(([m, v]) => ({ m, ...v })));
    })();
  }, [userId]);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">Last 12 months</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 80)" />
            <XAxis dataKey="m" stroke="oklch(0.5 0.03 260)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="oklch(0.5 0.03 260)" fontSize={11} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.01 80)", fontSize: 12 }}
              formatter={(v: number) => [`TZS ${Number(v).toLocaleString()}`, ""]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="deposit" name="Deposits" fill="oklch(0.71 0.18 50)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="contribution" name="Contributions" fill="oklch(0.55 0.15 200)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
