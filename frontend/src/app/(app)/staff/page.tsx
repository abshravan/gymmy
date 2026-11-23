"use client";

import { useState } from "react";
import { Alert, Badge, Field, Modal, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Staff } from "@/lib/types";

const ROLES = [
  { value: "receptionist", label: "Receptionist", desc: "Registers members, sells memberships, takes payments, checks members in" },
  { value: "trainer", label: "Trainer", desc: "Read-only access to members and attendance" },
  { value: "manager", label: "Manager", desc: "Everything except gym settings and staff management" },
  { value: "owner", label: "Owner", desc: "Full access" },
];

export default function StaffPage() {
  const { can, me } = useAuth();
  const manage = can("staff:manage");
  const { data, reload } = useApi<Staff[]>("/staff");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "receptionist" });
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<Staff & { temporary_password: string }>("/staff", { body: { ...form, phone: form.phone || null } });
      setOpen(false);
      setForm({ name: "", email: "", phone: "", role: "receptionist" });
      setSecret(`${r.email} can now sign in with temporary password: ${r.temporary_password}`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function update(s: Staff, body: Partial<Staff>) {
    try {
      await api(`/staff/${s.id}`, { method: "PATCH", body });
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  async function reset(s: Staff) {
    if (!confirm(`Reset password for ${s.name}? They will be signed out.`)) return;
    const r = await api<{ temporary_password: string }>(`/staff/${s.id}/reset-password`, { body: {} });
    setSecret(`New temporary password for ${s.email}: ${r.temporary_password}`);
  }

  return (
    <>
      <PageHeader title="Staff" actions={manage && <button className="btn" onClick={() => setOpen(true)}>Add staff</button>} />
      {secret && <div className="alert info" style={{ marginBottom: "1rem" }}>{secret} — share it securely; it won&apos;t be shown again.</div>}
      <section className="card flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}{s.id === me?.id && <span className="muted"> (you)</span>}</td>
                  <td>{s.email}</td>
                  <td>
                    {manage && s.id !== me?.id ? (
                      <select value={s.role} onChange={(e) => update(s, { role: e.target.value })} style={{ width: 150 }}>
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : <span style={{ textTransform: "capitalize" }}>{s.role}</span>}
                  </td>
                  <td><Badge value={s.status} /></td>
                  <td>{date(s.created_at)}</td>
                  <td className="right">
                    {manage && s.id !== me?.id && (
                      <div className="row gap" style={{ justifyContent: "flex-end" }}>
                        <button className="btn small ghost" onClick={() => reset(s)}>Reset password</button>
                        <button className="btn small ghost" onClick={() => update(s, { status: s.status === "active" ? "disabled" : "active" })}>
                          {s.status === "active" ? "Disable" : "Enable"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={open} title="Add staff member" onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={invite}>
          <Alert>{error}</Alert>
          <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Role" hint={ROLES.find((r) => r.value === form.role)?.desc}>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <p className="muted">A temporary password is generated for you to share. Email invites come later.</p>
          <div className="actions"><button className="btn">Add staff</button></div>
        </form>
      </Modal>
    </>
  );
}
