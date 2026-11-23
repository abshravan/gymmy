"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./skeleton";

/** Charts pull in recharts (~150 kB); load them after the page shell. */
export const LazyTrendChart = dynamic(() => import("./trend-chart").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="m-2 h-[220px]" />,
});
