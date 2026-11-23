import { cx } from "@/utils/cx";

/** Gymmy mark: a stylised dumbbell inside a brand tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic",
        "before:absolute before:inset-px before:rounded-[7px] before:border before:border-white/15 before:mask-b-from-0%",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-primary">Gymmy</span>
    </span>
  );
}
