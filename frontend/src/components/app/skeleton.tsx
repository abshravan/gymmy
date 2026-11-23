import { cx } from "@/utils/cx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-secondary" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-6 py-5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cx(c === 0 ? "w-48" : "flex-1", "h-3.5")} />
          ))}
        </div>
      ))}
    </div>
  );
}
