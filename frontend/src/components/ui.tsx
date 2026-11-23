"use client";

import { useEffect, useRef } from "react";
import type { MembershipStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row gap">{actions}</div>}
    </header>
  );
}

const statusTone: Record<string, string> = {
  active: "good",
  paid: "good",
  ok: "good",
  upcoming: "info",
  partial: "warn",
  frozen: "info",
  expired: "bad",
  unpaid: "bad",
  cancelled: "muted",
  none: "muted",
  suspended: "bad",
  inactive: "muted",
  disabled: "muted",
  archived: "muted",
  refund: "warn",
  payment: "good",
};

export function Badge({ value, label }: { value: MembershipStatus | string; label?: string }) {
  return <span className={`badge ${statusTone[value] ?? "muted"}`}>{label ?? value.replace("_", " ")}</span>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: React.ReactNode }) {
  if (!children) return null;
  return <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Modal({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn ghost icon" onClick={onClose} aria-label="Close">×</button>
      </div>
      {open && children}
    </dialog>
  );
}

export function Pager({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="pager">
      <button className="btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {pages} · {total} total</span>
      <button className="btn ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
