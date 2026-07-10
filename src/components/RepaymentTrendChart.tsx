import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  mode: "member" | "admin";
  userId?: string;
  title?: string;
}

export function RepaymentTrendChart({ mode, userId, title }: Props) {
  const [data, setData] = useState<{ m: string; total: number }[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      let q = supabase
        .from("transactions")
        .select("amount, created_at, user_id")
        .eq("tx_type", "repayment")
        .gte("created_at", since.toISOString());
      if (mode === "member" && userId) q = q.eq("user_id", userId);
      const { data: rows } = await q;
      const buckets: Record<string, number> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        buckets[d.toLocaleString(undefined, { month: "short" })] = 0;
      }
      (rows ?? []).forEach((r: any) => {
        const k = new Date(r.created_at).toLocaleString(undefined, { month: "short" });
        if (!(k in buckets)) buckets[k] = 0;
        buckets[k] += Number(r.amount);
      });
      setData(Object.entries(buckets).map(([m, total]) => ({ m, total })));
    })();
  }, [mode, userId]);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-foreground">
        {title ?? (mode === "admin" ? "Repayment trend (all members)" : "Your loan repayments")}
      </h3>
      <p className="text-xs text-muted-foreground">Last 12 months</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -10, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 80)" />
            <XAxis
              dataKey="m"
              stroke="oklch(0.5 0.03 260)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="oklch(0.5 0.03 260)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid oklch(0.92 0.01 80)",
                fontSize: 12,
              }}
              formatter={(v: number) => [`TZS ${Number(v).toLocaleString()}`, "Repayment"]}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="oklch(0.55 0.18 25)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
