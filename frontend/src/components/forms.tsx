"use client";

import { useState } from "react";
import { api, newIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, todayISO, duration } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Plan, SubscriptionSummary } from "@/lib/types";
import { Alert, Field } from "./ui";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

export function MethodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}

/** Sell a new membership (mode="sell") or renew an existing one (mode="renew"). */
export function SellForm({ memberId, renewFrom, onDone, onCancel }: {
  memberId: string;
  renewFrom?: SubscriptionSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { me } = useAuth();
  const currency = me?.currency ?? "INR";
  const { data: plans } = useApi<Plan[]>("/membership-plans");
  const [planId, setPlanId] = useState(renewFrom?.plan_id ?? "");
  const [startDate, setStartDate] = useState(renewFrom ? "" : todayISO());
  const [discount, setDiscount] = useState("0");
  const [takePayment, setTakePayment] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans?.find((p) => p.id === planId);
  const total = plan ? Math.max(0, Number(plan.price) - Number(discount || 0)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payment = takePayment && total > 0
      ? { amount: amount || total.toFixed(2), method, reference: reference || null }
      : null;
    const body = {
      plan_id: planId,
      start_date: startDate || null,
      discount: discount || "0",
      payment,
    };
    try {
      if (renewFrom) {
        await api(`/subscriptions/${renewFrom.id}/renew`, { body });
      } else {
        await api(`/members/${memberId}/subscriptions`, { body });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <Alert>{error}</Alert>
      <Field label="Plan">
        <select required value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Select a plan…</option>
          {plans?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {duration(p.duration_value, p.duration_unit)} · {money(p.price, currency)}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Start date" hint={renewFrom ? "Leave blank to follow the gym's renewal rule" : undefined}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required={!renewFrom} />
        </Field>
        <Field label="Discount">
          <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
      </div>
      {plan && <p><strong>Total: {money(total, currency)}</strong></p>}
      <label className="row gap"><input type="checkbox" style={{ width: "auto" }} checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} /> Record payment now</label>
      {takePayment && (
        <div className="form-grid">
          <Field label="Amount" hint="Less than total = partial payment">
            <input type="number" min="0.01" step="0.01" placeholder={total.toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Method"><MethodSelect value={method} onChange={setMethod} /></Field>
          <Field label="Reference"><input placeholder="UPI ref / last 4 digits" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy || !planId}>{busy ? "Saving…" : renewFrom ? "Renew" : "Sell membership"}</button>
      </div>
    </form>
  );
}

export function PaymentForm({ memberId, subscription, onDone, onCancel }: {
  memberId: string;
  subscription: SubscriptionSummary | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { me } = useAuth();
  const [amount, setAmount] = useState(subscription ? subscription.balance_due : "");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form instance: a double submit or retry can't double-charge.
  const [key] = useState(newIdempotencyKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/payments", {
        body: {
          member_id: memberId,
          subscription_id: subscription?.id ?? null,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
        },
        headers: { "Idempotency-Key": key },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <Alert>{error}</Alert>
      {subscription && (
        <p className="muted">
          {subscription.plan_name}: balance due {money(subscription.balance_due, me?.currency ?? "INR")}
        </p>
      )}
      <div className="form-grid">
        <Field label="Amount"><input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method"><MethodSelect value={method} onChange={setMethod} /></Field>
      </div>
      <Field label="Reference"><input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
      </div>
    </form>
  );
}

export function ReasonForm({ label, submitLabel, danger, withDate, withAmount, onSubmit, onCancel }: {
  label: string;
  submitLabel: string;
  danger?: boolean;
  withDate?: string;
  withAmount?: string;
  onSubmit: (v: { reason: string; date: string; amount: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit({ reason, date, amount });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Alert>{error}</Alert>
      {withDate && <Field label={withDate}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      {withAmount !== undefined && (
        <Field label="Amount" hint={`Leave blank for the full refundable amount (${withAmount})`}>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
      <Field label={label}><textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required={danger} /></Field>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Back</button>
        <button className={`btn ${danger ? "danger" : ""}`} disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
