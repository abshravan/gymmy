"use client";

import { Bank, Check, CreditCard02, Coins03, Phone01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { api, newIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { duration, money, todayISO } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Plan, SubscriptionSummary } from "@/lib/types";
import { cx } from "@/utils/cx";
import { AnimatedNumber } from "./animated-number";
import { ModalActions } from "./app-modal";
import { FormError } from "./auth-layout";
import { DateField } from "./date-field";
import { FieldGrid, Segmented } from "./fields";
import { Skeleton } from "./skeleton";

export const METHODS = [
  { value: "cash", label: "Cash", icon: Coins03 },
  { value: "upi", label: "UPI", icon: Phone01 },
  { value: "card", label: "Card", icon: CreditCard02 },
  { value: "bank_transfer", label: "Bank", icon: Bank },
];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Plan picker as selectable cards. */
function PlanCards({ plans, value, onChange, currency }: { plans: Plan[]; value: string; onChange: (id: string) => void; currency: string }) {
  return (
    <div role="radiogroup" aria-label="Plan" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {plans.map((p, i) => {
        const on = p.id === value;
        return (
          <motion.button
            type="button"
            role="radio"
            aria-checked={on}
            key={p.id}
            onClick={() => onChange(p.id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.98 }}
            className={cx(
              "relative flex flex-col items-start rounded-xl p-4 text-left ring-1 outline-focus-ring transition-shadow ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
              on ? "bg-brand-primary_alt ring-2 ring-brand" : "bg-primary ring-secondary hover:ring-primary",
            )}
          >
            <span className="text-md font-semibold text-primary">{p.name}</span>
            <span className="text-sm text-tertiary">{duration(p.duration_value, p.duration_unit)}</span>
            <span className="mt-2 text-lg font-semibold text-primary">{money(p.price, currency)}</span>
            <AnimatePresence>
              {on && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-brand-solid text-white"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Sell a new membership, or renew `renewFrom`. */
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
  const [discount, setDiscount] = useState("");
  const [takePayment, setTakePayment] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans?.find((p) => p.id === planId);
  const total = plan ? Math.max(0, Number(plan.price) - Number(discount || 0)) : 0;
  const paying = takePayment && total > 0 ? Number(amount || total) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      plan_id: planId,
      start_date: startDate || null,
      discount: discount || "0",
      payment: paying > 0 ? { amount: paying.toFixed(2), method, reference: reference || null } : null,
    };
    try {
      await api(renewFrom ? `/subscriptions/${renewFrom.id}/renew` : `/members/${memberId}/subscriptions`, { body });
      toast.success(renewFrom ? "Membership renewed" : "Membership sold", {
        description: paying > 0 ? `${money(paying, currency)} received by ${METHODS.find((m) => m.value === method)?.label}` : "No payment recorded yet",
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormError message={error} />
      {!plans ? (
        <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : plans.length === 0 ? (
        <p className="rounded-lg bg-secondary p-4 text-sm text-tertiary">No active plans. Create one on the Plans page first.</p>
      ) : (
        <PlanCards plans={plans} value={planId} onChange={setPlanId} currency={currency} />
      )}
      <FieldGrid>
        <DateField label="Start date" value={startDate} onChange={setStartDate} hint={renewFrom && !startDate ? "Follows your gym's renewal rule" : undefined} />
        <Input label="Discount" type="number" inputMode="decimal" placeholder="0.00" value={discount} onChange={setDiscount} />
      </FieldGrid>

      <div className="rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-tertiary">Total</span>
          <span className="text-xl font-semibold text-primary">
            <AnimatedNumber value={total} format={(n) => money(n, currency)} />
          </span>
        </div>
        <Toggle className="mt-4" label="Record payment now" isSelected={takePayment} onChange={setTakePayment} />
        <AnimatePresence initial={false}>
          {takePayment && total > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 pt-4">
                <Segmented label="Method" value={method} onChange={setMethod} options={METHODS} />
                <FieldGrid>
                  <Input label="Amount" type="number" inputMode="decimal" placeholder={total.toFixed(2)} value={amount} onChange={setAmount}
                    hint={paying > 0 && paying < total ? `Partial — ${money(total - paying, currency)} will be due` : "Leave blank for the full amount"} />
                  <Input label="Reference" placeholder="UPI ref / card last 4" value={reference} onChange={setReference} />
                </FieldGrid>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ModalActions className="mt-1">
        <Button color="secondary" size="lg" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="lg" isDisabled={!planId} isLoading={busy} showTextWhileLoading>
          {renewFrom ? "Renew membership" : paying > 0 ? `Sell · ${money(paying, currency)}` : "Sell membership"}
        </Button>
      </ModalActions>
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
  const currency = me?.currency ?? "INR";
  const due = subscription ? Number(subscription.balance_due) : 0;
  const [amount, setAmount] = useState(due ? due.toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form: a double submit or network retry can't charge twice.
  const [key] = useState(newIdempotencyKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/payments", {
        body: { member_id: memberId, subscription_id: subscription?.id ?? null, amount, method, reference: reference || null, notes: notes || null },
        headers: { "Idempotency-Key": key },
      });
      toast.success("Payment recorded", { description: `${money(amount, currency)} by ${METHODS.find((m) => m.value === method)?.label}` });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormError message={error} />
      {subscription && (
        <div className="flex items-center justify-between rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
          <div>
            <p className="text-sm font-medium text-primary">{subscription.plan_name}</p>
            <p className="text-sm text-tertiary">Balance due</p>
          </div>
          <p className="text-xl font-semibold text-error-primary">{money(subscription.balance_due, currency)}</p>
        </div>
      )}
      <Segmented label="Method" value={method} onChange={setMethod} options={METHODS} />
      <div className="flex flex-col gap-2">
        <Input label="Amount" type="number" inputMode="decimal" isRequired value={amount} onChange={setAmount} />
        {due > 0 && (
          <div className="flex gap-2">
            {[1, 0.5].map((f) => (
              <button key={f} type="button" onClick={() => setAmount((due * f).toFixed(2))}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset transition hover:bg-primary_hover">
                {f === 1 ? "Full balance" : "Half"}
              </button>
            ))}
          </div>
        )}
      </div>
      <FieldGrid>
        <Input label="Reference" placeholder="Optional" value={reference} onChange={setReference} />
        <Input label="Note" placeholder="Optional" value={notes} onChange={setNotes} />
      </FieldGrid>
      <ModalActions className="mt-1">
        <Button color="secondary" size="lg" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="lg" isLoading={busy} showTextWhileLoading isDisabled={!amount}>
          Record {amount ? money(amount, currency) : "payment"}
        </Button>
      </ModalActions>
    </form>
  );
}

export function ReasonForm({ reasonLabel, submitLabel, destructive, requireReason, dateLabel, refundable, onSubmit, onCancel }: {
  reasonLabel: string;
  submitLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  dateLabel?: string;
  refundable?: string;
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
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit({ reason, date, amount });
        } catch (err) {
          setError(errMsg(err));
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      {dateLabel && <DateField label={dateLabel} value={date} onChange={setDate} />}
      {refundable !== undefined && (
        <Input label="Amount" type="number" inputMode="decimal" placeholder={refundable} value={amount} onChange={setAmount} hint={`Leave blank to refund the full ${refundable}`} />
      )}
      <TextArea label={reasonLabel} isRequired={requireReason} minLength={requireReason ? 3 : undefined} rows={3} value={reason} onChange={setReason} />
      <ModalActions className="mt-1">
        <Button color="secondary" size="lg" onClick={onCancel}>Back</Button>
        <Button type="submit" size="lg" color={destructive ? "primary-destructive" : "primary"} isLoading={busy} showTextWhileLoading>
          {submitLabel}
        </Button>
      </ModalActions>
    </form>
  );
}
