"use client";

import Link from "next/link";
import { useState } from "react";
import { api, qs } from "@/lib/api";
import type { MemberDetail } from "@/lib/types";
import { Alert, Field } from "./ui";

type Dup = { id: string; member_number: string; full_name: string; phone: string };

const EMPTY = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  gender: "",
  date_of_birth: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
};

export function MemberForm({ initial, onSaved, onCancel }: {
  initial?: MemberDetail;
  onSaved: (m: MemberDetail) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY;
    const f = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) f[k] = (initial[k] as string | null) ?? "";
    return f;
  });
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [dups, setDups] = useState<Dup[]>([]);
  const [confirmDup, setConfirmDup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function checkPhone() {
    if (initial || form.phone.trim().length < 5) return;
    try {
      setDups(await api<Dup[]>(`/members/duplicates${qs({ phone: form.phone })}`));
    } catch {
      /* advisory only */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
    try {
      const m = initial
        ? await api<MemberDetail>(`/members/${initial.id}`, { method: "PATCH", body: { ...body, status } })
        : await api<MemberDetail>("/members", { body: { ...body, allow_duplicate_phone: confirmDup } });
      onSaved(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      if (!initial) checkPhone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <Alert>{error}</Alert>
      <div className="form-grid">
        <Field label="First name *"><input required value={form.first_name} onChange={set("first_name")} /></Field>
        <Field label="Last name"><input value={form.last_name} onChange={set("last_name")} /></Field>
        <Field label="Phone *"><input required minLength={5} value={form.phone} onChange={set("phone")} onBlur={checkPhone} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="Gender">
          <select value={form.gender} onChange={set("gender")}>
            <option value="">—</option><option>Female</option><option>Male</option><option>Other</option>
          </select>
        </Field>
        <Field label="Date of birth"><input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></Field>
      </div>
      {dups.length > 0 && (
        <div className="alert info">
          <strong>Possible duplicate:</strong>{" "}
          {dups.map((d, i) => (
            <span key={d.id}>{i > 0 && ", "}<Link href={`/members/${d.id}`}>{d.full_name} ({d.member_number})</Link></span>
          ))}{" "}
          already uses this phone number.
          <label className="row gap" style={{ marginTop: 6 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} />
            This is a different person — register anyway
          </label>
        </div>
      )}
      <Field label="Address"><input value={form.address} onChange={set("address")} /></Field>
      <div className="form-grid">
        <Field label="Emergency contact"><input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} /></Field>
        <Field label="Emergency phone"><input value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} /></Field>
      </div>
      <Field label="Notes" hint="Visible to staff. Avoid recording health details unless needed."><textarea value={form.notes} onChange={set("notes")} /></Field>
      {initial && (
        <Field label="Account status">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (blocked from check-in)</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      )}
      <div className="actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn" disabled={busy || (dups.length > 0 && !confirmDup && !initial)}>
          {busy ? "Saving…" : initial ? "Save changes" : "Register member"}
        </button>
      </div>
    </form>
  );
}
