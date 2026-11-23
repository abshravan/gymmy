"use client";

import { useState } from "react";
import { Alert, Badge, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { duration, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Plan } from "@/lib/types";

function PlanForm({ plan, onDone, onCancel }: { plan?: Plan; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    duration_value: String(plan?.duration_value ?? 1),
    duration_unit: plan?.duration_unit ?? "months",
    price: plan?.price ?? "",
    max_freeze_days: String(plan?.max_freeze_days ?? 0),
    terms: plan?.terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      duration_value: Number(f.duration_value),
      max_freeze_days: Number(f.max_freeze_days),
      description: f.description || null,
      terms: f.terms || null,
    };
    try {
      if (plan) await api(`/membership-plans/${plan.id}`, { method: "PATCH", body });
      else await api("/membership-plans", { body });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Alert>{error}</Alert>
      <Field label="Name"><input required value={f.name} onChange={set("name")} placeholder="Monthly, Quarterly…" /></Field>
      <div className="form-grid">
        <Field label="Duration"><input type="number" min={1} required value={f.duration_value} onChange={set("duration_value")} /></Field>
        <Field label="Unit">
          <select value={f.duration_unit} onChange={set("duration_unit")}><option value="months">Months</option><option value="days">Days</option></select>
        </Field>
        <Field label="Price"><input type="number" min={0} step="0.01" required value={f.price} onChange={set("price")} /></Field>
        <Field label="Freeze allowance (days)" hint="0 = no limit"><input type="number" min={0} value={f.max_freeze_days} onChange={set("max_freeze_days")} /></Field>
      </div>
      <Field label="Description"><input value={f.description} onChange={set("description")} /></Field>
      <Field label="Terms"><textarea value={f.terms} onChange={set("terms")} /></Field>
      {plan && <p className="muted">Changes apply to future sales. Existing memberships keep their price and dates.</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn">{plan ? "Save" : "Create plan"}</button>
      </div>
    </form>
  );
}

export default function Plans() {
  const { can, me } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, reload } = useApi<Plan[]>(`/membership-plans?include_archived=${showArchived}`);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const manage = can("plans:manage");

  async function toggleArchive(p: Plan) {
    await api(`/membership-plans/${p.id}`, { method: "PATCH", body: { status: p.status === "active" ? "archived" : "active" } });
    reload();
  }

  return (
    <>
      <PageHeader
        title="Membership plans"
        actions={
          <>
            <label className="row gap muted"><input type="checkbox" style={{ width: "auto" }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
            {manage && <button className="btn" onClick={() => setEditing("new")}>New plan</button>}
          </>
        }
      />
      <section className="card flush">
        {data?.length === 0 ? <Empty>No plans yet. Create your first plan to start selling memberships.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Plan</th><th>Duration</th><th className="num">Price</th><th>Freeze allowance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong>{p.description && <div className="muted">{p.description}</div>}</td>
                    <td>{duration(p.duration_value, p.duration_unit)}</td>
                    <td className="num">{money(p.price, me?.currency ?? "INR")}</td>
                    <td>{p.max_freeze_days ? `${p.max_freeze_days} days` : "No limit"}</td>
                    <td><Badge value={p.status} /></td>
                    <td className="right">
                      {manage && (
                        <div className="row gap" style={{ justifyContent: "flex-end" }}>
                          <button className="btn small ghost" onClick={() => setEditing(p)}>Edit</button>
                          <button className="btn small ghost" onClick={() => toggleArchive(p)}>{p.status === "active" ? "Archive" : "Restore"}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal open={editing !== null} title={editing === "new" ? "New plan" : "Edit plan"} onClose={() => setEditing(null)}>
        {editing && <PlanForm plan={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
