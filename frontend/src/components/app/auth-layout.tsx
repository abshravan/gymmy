"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle } from "@untitledui/icons";
import { Logo } from "./logo";

const POINTS = [
  "Check members in with a QR scan in under a second",
  "Sell, renew and freeze memberships without spreadsheets",
  "See collections, dues and expiring members at a glance",
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-primary lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8 lg:px-16">
        <Logo />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="mx-auto flex w-full max-w-90 flex-1 flex-col justify-center py-12"
        >
          <h1 className="text-display-sm font-semibold text-primary">{title}</h1>
          <p className="mt-3 text-md text-tertiary">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
        <p className="text-sm text-quaternary">© {new Date().getFullYear()} Gymmy</p>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-section lg:block">
        <motion.div
          aria-hidden="true"
          className="absolute -top-32 -right-32 size-[480px] rounded-full bg-brand-solid opacity-40 blur-3xl"
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ type: "tween", duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-40 -left-24 size-[420px] rounded-full bg-brand-500 opacity-30 blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, -20, 0] }}
          transition={{ type: "tween", duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex h-full flex-col justify-end p-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="max-w-md text-display-md font-semibold text-white"
          >
            Run your front desk, not your spreadsheets.
          </motion.h2>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((p, i) => (
              <motion.li
                key={p}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-lg text-white/85"
              >
                <CheckCircle className="size-6 shrink-0 text-white/70" />
                {p}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="form-error"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          aria-live="polite"
        >
          <motion.div
            key={message}
            animate={{ x: [6, -4, 2, 0] }}
            transition={{ type: "tween", duration: 0.35 }}
            className="rounded-lg bg-error-primary px-4 py-3 text-sm font-medium text-error-primary ring-1 ring-error_subtle ring-inset"
            role="alert"
          >
            {message}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
