"use client";

import { motion } from "motion/react";

export function PageHeader({ title, description, actions }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
        {description && <div className="mt-1 text-md text-tertiary">{description}</div>}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-wrap items-center gap-3"
        >
          {actions}
        </motion.div>
      )}
    </header>
  );
}

export function Section({ title, description, actions, children, className }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ${className ?? ""}`}>
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6 md:py-5">
          <div>
            {title && <h2 className="text-lg font-semibold text-primary">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-tertiary">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
