"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Field, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Branch, Organization } from "@/lib/types";

export default function Settings() {
  const { data: org, setData } = useApi<Organization>("/organization");
  const { data: branches, reload } = useApi<Branch[]>("/branches");
  const [form, setForm] = useState<Partial<Organization>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [branchName, setBranchName] = useState("");

  useEffect(() => {
    if (org) setForm(org);
  }, [org]);

  const set = (k: keyof Organization) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { name, email, phone, address, timezone, currency, renewal_mode } = form;
      setData(await api<Organization>("/organization", { method: "PATCH", body: { name, email, phone, address, timezone, currency, renewal_mode } }));
      setMsg({ kind: "success", text: "Settings saved" });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Failed" });
    }
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    await api("/branches", { body: { name: branchName } });
    setBranchName("");
    reload();
  }

  if (!org) return <div className="empty">Loading…</div>;

  return (
    <>
      <PageHeader title="Gym settings" />
      <div className="grid two">
        <form className="card stack" onSubmit={save}>
          <h2>Gym profile</h2>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Field label="Gym name"><input required value={form.name ?? ""} onChange={set("name")} /></Field>
          <div className="form-grid">
            <Field label="Email"><input type="email" value={form.email ?? ""} onChange={set("email")} /></Field>
            <Field label="Phone"><input value={form.phone ?? ""} onChange={set("phone")} /></Field>
          </div>
          <Field label="Address"><input value={form.address ?? ""} onChange={set("address")} /></Field>
          <div className="form-grid">
            <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata"><input required value={form.timezone ?? ""} onChange={set("timezone")} /></Field>
            <Field label="Currency" hint="ISO code, e.g. INR"><input required maxLength={3} value={form.currency ?? ""} onChange={set("currency")} /></Field>
          </div>
          <Field label="Renewals start">
            <select value={form.renewal_mode} onChange={set("renewal_mode")}>
              <option value="after_current">After the current membership ends</option>
              <option value="immediate">Immediately on the renewal date</option>
            </select>
          </Field>
          <div className="actions"><button className="btn">Save</button></div>
        </form>
        <section className="card stack">
          <h2>Branches</h2>
          <p className="muted">Memberships are valid at all branches unless sold for a specific branch.</p>
          {branches?.map((b) => (
            <div key={b.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <span>{b.name}</span><Badge value={b.status} />
            </div>
          ))}
          <form className="row gap" onSubmit={addBranch}>
            <input placeholder="New branch name" required value={branchName} onChange={(e) => setBranchName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn ghost">Add</button>
          </form>
        </section>
      </div>
    </>
  );
}
