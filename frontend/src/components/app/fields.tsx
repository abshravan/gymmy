"use client";

import type { FC } from "react";
import { motion } from "motion/react";
import { useId } from "react";
import { Label } from "@/components/base/input/label";
import { Select } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

export interface Option {
  value: string;
  label: string;
  sub?: string;
}

export function SelectField({ label, value, onChange, options, placeholder, hint, isRequired, size = "md", className }: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  hint?: string;
  isRequired?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Select
      label={label}
      aria-label={label ? undefined : placeholder}
      placeholder={placeholder}
      hint={hint}
      isRequired={isRequired}
      size={size}
      className={className}
      items={options.map((o) => ({ id: o.value, label: o.label, supportingText: o.sub }))}
      selectedKey={value === "" ? null : value}
      onSelectionChange={(k) => onChange(k == null ? "" : String(k))}
    >
      {(item) => (
        <Select.Item id={item.id} supportingText={item.supportingText}>
          {item.label}
        </Select.Item>
      )}
    </Select>
  );
}

/** Pill-style single choice with a sliding indicator. */
export function Segmented({ label, value, onChange, options, className }: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: FC<{ className?: string }> }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && <Label>{label}</Label>}
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-secondary_alt p-1 ring-1 ring-secondary ring-inset">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              type="button"
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cx(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-semibold whitespace-nowrap text-quaternary outline-focus-ring transition-colors hover:text-secondary focus-visible:outline-2",
                on && "text-secondary",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`seg-${id}`}
                  className="absolute inset-0 rounded-md bg-primary_alt shadow-sm ring-1 ring-secondary ring-inset"
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                />
              )}
              {o.icon && <o.icon className="relative size-4" />}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cx("grid grid-cols-1 gap-4", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>{children}</div>;
}
