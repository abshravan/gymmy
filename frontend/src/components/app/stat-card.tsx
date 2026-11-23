"use client";

import type { FC } from "react";
import { motion } from "motion/react";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";
import { AnimatedNumber } from "./animated-number";

export function StatCard({ label, value, format, icon, hint, tone = "brand", index = 0, emphasis }: {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon: FC<{ className?: string }>;
  hint?: React.ReactNode;
  tone?: "brand" | "gray" | "success" | "warning" | "error";
  index?: number;
  emphasis?: "error" | "success";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 380, damping: 32 }}
      whileHover={{ y: -2 }}
      className="flex flex-col gap-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-tertiary">{label}</span>
        <FeaturedIcon icon={icon} color={tone} theme="light" size="md" />
      </div>
      <div>
        <div
          className={cx(
            "text-display-sm font-semibold text-primary",
            emphasis === "error" && value > 0 && "text-error-primary",
            emphasis === "success" && "text-success-primary",
          )}
        >
          <AnimatedNumber value={value} format={format} />
        </div>
        {hint && <div className="mt-1 text-sm text-tertiary">{hint}</div>}
      </div>
    </motion.div>
  );
}
