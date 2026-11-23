"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartActiveDot, ChartTooltipContent } from "@/components/application/charts/charts-base";

import type { Point } from "./fill-days";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const compact = (n: number) =>
  n >= 10000 ? new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString("en-IN");

/**
 * Single-series trend. One series, so no legend: the card title names it.
 * Brand hue (validated for contrast on light and dark surfaces), 2px line, 10% wash,
 * hairline solid grid, crosshair tooltip on hover.
 */
export function TrendChart({ data, kind = "area", format, label, height = 240 }: {
  data: Point[];
  kind?: "area" | "bar";
  format: (n: number) => string;
  label: string;
  height?: number;
}) {
  const tooltip = (
    <Tooltip
      cursor={kind === "area" ? { className: "stroke-utility-brand-600", strokeWidth: 1 } : { className: "fill-bg-secondary" }}
      content={<ChartTooltipContent />}
      formatter={(v) => format(Number(v))}
      labelFormatter={(l) => `${label} · ${shortDate(String(l))}`}
      isAnimationActive={false}
    />
  );
  const axes = (
    <>
      <CartesianGrid vertical={false} className="stroke-border-secondary" strokeWidth={1} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        axisLine={false}
        tickLine={false}
        minTickGap={24}
        tickMargin={10}
        tick={{ className: "fill-text-quaternary", fontSize: 12 }}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        width={64}
        tickFormatter={compact}
        allowDecimals={false}
        tick={{ className: "fill-text-quaternary", fontSize: 12 }}
      />
    </>
  );

  return (
    <figure aria-label={`${label} chart`} className="text-utility-brand-600">
      <ResponsiveContainer width="100%" height={height}>
        {kind === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.14} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes}
            {tooltip}
            <Area
              type="monotone"
              dataKey="value"
              name={label}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#trend-wash)"
              activeDot={<ChartActiveDot />}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barCategoryGap={2}>
            {axes}
            {tooltip}
            <Bar dataKey="value" name={label} fill="currentColor" maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={700} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
