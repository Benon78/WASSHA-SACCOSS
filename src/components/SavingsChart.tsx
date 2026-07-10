import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { m: "Jan", v: 1200000 },
  { m: "Feb", v: 1380000 },
  { m: "Mar", v: 1520000 },
  { m: "Apr", v: 1610000 },
  { m: "May", v: 1840000 },
  { m: "Jun", v: 2050000 },
  { m: "Jul", v: 2280000 },
  { m: "Aug", v: 2510000 },
];

export function SavingsChart() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Savings growth</h3>
          <p className="text-xs text-muted-foreground">Last 8 months</p>
        </div>
        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          +18.4%
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -10, right: 8, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.71 0.18 50)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.71 0.18 50)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid oklch(0.92 0.01 80)",
                fontSize: 12,
              }}
              formatter={(v: number) => [`TZS ${v.toLocaleString()}`, "Savings"]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke="oklch(0.71 0.18 50)"
              strokeWidth={2.5}
              fill="url(#g1)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
