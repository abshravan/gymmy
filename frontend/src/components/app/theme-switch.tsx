"use client";

import { Monitor01, Moon01, Sun } from "@untitledui/icons";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cx } from "@/utils/cx";

const OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon01 },
  { id: "system", label: "System", icon: Monitor01 },
];

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : undefined;

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-secondary_alt p-0.5 ring-1 ring-secondary ring-inset">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={current === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.id)}
          className={cx(
            "relative flex flex-1 items-center justify-center rounded-md py-1.5 text-fg-quaternary outline-focus-ring transition-colors hover:text-fg-secondary focus-visible:outline-2",
            current === o.id && "text-fg-secondary",
          )}
        >
          {current === o.id && (
            <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-md bg-primary_alt shadow-xs ring-1 ring-secondary ring-inset" />
          )}
          <o.icon className="relative size-4" />
        </button>
      ))}
    </div>
  );
}
