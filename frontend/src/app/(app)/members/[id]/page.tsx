"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useState } from "react";
import { PaymentForm, ReasonForm, SellForm } from "@/components/forms";
import { MemberForm } from "@/components/MemberForm";
import { Badge, Empty, Modal, PageHeader } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { AttendanceRecord, MemberDetail, Page, Payment, SubscriptionSummary } from "@/lib/types";

type Dialog =
  | { kind: "sell" }
  | { kind: "renew"; sub: SubscriptionSummary }
  | { kind: "pay"; sub: SubscriptionSummary | null }
  | { kind: "freeze"; sub: SubscriptionSummary }
  | { kind: "unfreeze"; sub: SubscriptionSummary }
  | { kind: "cancel"; sub: SubscriptionSummary }
  | { kind: "refund"; payment: Payment; refundable: number }
  | { kind: "edit" }
  | { kind: "qr" }
  | null;

function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { can, me } = useAuth();
  const c = me?.currency ?? "INR";
  const { data: m, error, reload: reloadMember, setData } = useApi<MemberDetail>(`/members/${id}`);
  const { data: payments, reload: reloadPayments } = useApi<Page<Payment>>(
    can("payments:read") ? `/payments${qs({ member_id: id, page_size: 50 })}` : null,
  );
  const { data: visits, reload: reloadVisits } = useApi<Page<AttendanceRecord>>(`/members/${id}/attendance${qs({ page_size: 10 })}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("sell") === "1" && can("subscriptions:write")) {
      setDialog({ kind: "sell" });
      router.replace(`/members/${id}`);
    }
  }, [params, id, router, can]);

  const done = (message: string) => {
    setDialog(null);
    setFlash(message);
    reloadMember();
    reloadPayments();
    reloadVisits();
  };

  async function checkIn() {
    const r = await api<{ allowed: boolean; message: string }>("/attendance/check-in", { body: { member_id: id } });
    setFlash(r.allowed ? r.message : `Not allowed: ${r.message}`);
    reloadVisits();
  }

  if (error) return <div className="alert error">{error}</div>;
  if (!m) return <div className="empty">Loading…</div>;

  const refundedOf = (pid: string) =>
    (payments?.items ?? []).filter((p) => p.refund_of_id === pid).reduce((s, p) => s + Number(p.amount), 0);
  const cur = m.current_subscription;

  return (
    <>
      <PageHeader
        title={m.full_name}
        subtitle={<>{m.member_number} · {m.phone} · <Badge value={m.membership_status} />{m.status !== "active" && <> <Badge value={m.status} /></>}</>}
        actions={
          <>
            {can("attendance:checkin") && <button className="btn" onClick={checkIn}>Check in</button>}
            {can("subscriptions:write") && <button className="btn ghost" onClick={() => setDialog({ kind: "sell" })}>Sell membership</button>}
            {can("payments:create") && <button className="btn ghost" onClick={() => setDialog({ kind: "pay", sub: cur && Number(cur.balance_due) > 0 ? cur : null })}>Take payment</button>}
            <button className="btn ghost" onClick={() => setDialog({ kind: "qr" })}>QR pass</button>
            {can("members:write") && <button className="btn ghost" onClick={() => setDialog({ kind: "edit" })}>Edit</button>}
          </>
        }
      />
      {flash && <div className="alert success" style={{ marginBottom: "1rem" }}>{flash}</div>}

      <div className="grid two">
        <section className="card">
          <h2>Current membership</h2>
          {cur ? (
            <dl className="dl">
              <dt>Plan</dt><dd>{cur.plan_name} <Badge value={cur.status} /></dd>
              <dt>Period</dt><dd>{date(cur.start_date)} → {date(cur.end_date)}</dd>
              <dt>Price</dt><dd>{money(cur.price, c)}{Number(cur.discount) > 0 && <span className="muted"> (discount {money(cur.discount, c)})</span>}</dd>
              <dt>Paid</dt><dd>{money(cur.amount_paid, c)} <Badge value={cur.payment_status} /></dd>
              {Number(m.total_balance_due) > 0 && <><dt>Total due</dt><dd style={{ color: "var(--bad)", fontWeight: 600 }}>{money(m.total_balance_due, c)}</dd></>}
            </dl>
          ) : (
            <Empty>No membership yet.</Empty>
          )}
        </section>
        <section className="card">
          <h2>Profile</h2>
          <dl className="dl">
            <dt>Email</dt><dd>{m.email ?? "—"}</dd>
            <dt>Date of birth</dt><dd>{date(m.date_of_birth)}</dd>
            <dt>Gender</dt><dd>{m.gender ?? "—"}</dd>
            <dt>Address</dt><dd>{m.address ?? "—"}</dd>
            <dt>Emergency</dt><dd>{m.emergency_contact_name ? `${m.emergency_contact_name} · ${m.emergency_contact_phone ?? ""}` : "—"}</dd>
            <dt>Member since</dt><dd>{date(m.created_at)}</dd>
            {m.notes && <><dt>Notes</dt><dd>{m.notes}</dd></>}
          </dl>
        </section>
      </div>

      <section className="card flush" style={{ marginTop: "1rem" }}>
        <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}><h2>Membership history</h2></div>
        {m.subscriptions.length === 0 ? <Empty>No memberships.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Plan</th><th>Start</th><th>End</th><th>Status</th><th className="num">Price</th><th className="num">Due</th><th></th></tr></thead>
              <tbody>
                {m.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.plan_name}</td>
                    <td>{date(s.start_date)}</td>
                    <td>{date(s.end_date)}</td>
                    <td><Badge value={s.status} /> {s.status !== "cancelled" && <Badge value={s.payment_status} />}</td>
                    <td className="num">{money(s.price, c)}</td>
                    <td className="num">{Number(s.balance_due) > 0 ? money(s.balance_due, c) : "—"}</td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: "flex-end" }}>
                        {s.status !== "cancelled" && Number(s.balance_due) > 0 && can("payments:create") && (
                          <button className="btn small" onClick={() => setDialog({ kind: "pay", sub: s })}>Pay</button>
                        )}
                        {s.status !== "cancelled" && can("subscriptions:write") && (
                          <button className="btn small ghost" onClick={() => setDialog({ kind: "renew", sub: s })}>Renew</button>
                        )}
                        {s.status === "active" && can("subscriptions:write") && (
                          <button className="btn small ghost" onClick={() => setDialog({ kind: "freeze", sub: s })}>Freeze</button>
                        )}
                        {s.status === "frozen" && can("subscriptions:write") && (
                          <button className="btn small ghost" onClick={() => setDialog({ kind: "unfreeze", sub: s })}>Unfreeze</button>
                        )}
                        {s.status !== "cancelled" && can("subscriptions:cancel") && (
                          <button className="btn small ghost" onClick={() => setDialog({ kind: "cancel", sub: s })}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid two" style={{ marginTop: "1rem" }}>
        {can("payments:read") && (
          <section className="card flush">
            <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}><h2>Payments</h2></div>
            {payments?.items.length === 0 ? <Empty>No payments.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {payments?.items.map((p) => {
                      const refundable = p.kind === "payment" ? Number(p.amount) - refundedOf(p.id) : 0;
                      return (
                        <tr key={p.id}>
                          <td>{dateTime(p.paid_at, me?.timezone)}</td>
                          <td>{p.receipt?.number ?? <Badge value="refund" />}</td>
                          <td>{p.method.replace("_", " ")}</td>
                          <td className="num" style={p.kind === "refund" ? { color: "var(--bad)" } : undefined}>
                            {p.kind === "refund" ? "−" : ""}{money(p.amount, c)}
                          </td>
                          <td className="right">
                            {refundable > 0 && can("payments:refund") && (
                              <button className="btn small ghost" onClick={() => setDialog({ kind: "refund", payment: p, refundable })}>Refund</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        <section className="card flush">
          <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}>
            <h2>Recent visits {visits && <span className="muted">({visits.total})</span>}</h2>
          </div>
          {visits?.items.length === 0 ? <Empty>No visits yet.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Checked in</th><th>Method</th></tr></thead>
                <tbody>
                  {visits?.items.map((a) => (
                    <tr key={a.id}>
                      <td>{dateTime(a.check_in_at, me?.timezone)}</td>
                      <td>{a.method.replace("_", " ")} {a.override_reason && <Badge value="partial" label="override" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal open={dialog?.kind === "sell"} title="Sell membership" onClose={() => setDialog(null)}>
        <SellForm memberId={m.id} onDone={() => done("Membership sold")} onCancel={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog?.kind === "renew"} title="Renew membership" onClose={() => setDialog(null)}>
        {dialog?.kind === "renew" && <SellForm memberId={m.id} renewFrom={dialog.sub} onDone={() => done("Membership renewed")} onCancel={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === "pay"} title="Record payment" onClose={() => setDialog(null)}>
        {dialog?.kind === "pay" && <PaymentForm memberId={m.id} subscription={dialog.sub} onDone={() => done("Payment recorded")} onCancel={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === "freeze"} title="Freeze membership" onClose={() => setDialog(null)}>
        {dialog?.kind === "freeze" && (
          <ReasonForm label="Reason" submitLabel="Freeze" withDate="Freeze from" onCancel={() => setDialog(null)}
            onSubmit={async (v) => { await api(`/subscriptions/${dialog.sub.id}/freeze`, { body: { start_date: v.date, reason: v.reason || null } }); done("Membership frozen"); }} />
        )}
      </Modal>
      <Modal open={dialog?.kind === "unfreeze"} title="Unfreeze membership" onClose={() => setDialog(null)}>
        {dialog?.kind === "unfreeze" && (
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); await api(`/subscriptions/${dialog.sub.id}/unfreeze`, { body: {} }); done("Membership resumed; end date extended"); }}>
            <p>The end date will be pushed out by the days frozen, up to the plan&apos;s freeze allowance.</p>
            <div className="actions"><button className="btn">Unfreeze today</button></div>
          </form>
        )}
      </Modal>
      <Modal open={dialog?.kind === "cancel"} title="Cancel membership" onClose={() => setDialog(null)}>
        {dialog?.kind === "cancel" && (
          <ReasonForm danger label="Reason (required)" submitLabel="Cancel membership" onCancel={() => setDialog(null)}
            onSubmit={async (v) => { await api(`/subscriptions/${dialog.sub.id}/cancel`, { body: { reason: v.reason } }); done("Membership cancelled. Issue any refund from the payments list."); }} />
        )}
      </Modal>
      <Modal open={dialog?.kind === "refund"} title="Refund payment" onClose={() => setDialog(null)}>
        {dialog?.kind === "refund" && (
          <ReasonForm danger label="Reason (required)" submitLabel="Record refund" withAmount={money(dialog.refundable, c)} onCancel={() => setDialog(null)}
            onSubmit={async (v) => { await api(`/payments/${dialog.payment.id}/refund`, { body: { reason: v.reason, amount: v.amount || null } }); done("Refund recorded"); }} />
        )}
      </Modal>
      <Modal open={dialog?.kind === "edit"} title="Edit member" onClose={() => setDialog(null)}>
        <MemberForm initial={m} onSaved={(nm) => { setData(nm); setDialog(null); setFlash("Saved"); }} onCancel={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog?.kind === "qr"} title="Member QR pass" onClose={() => setDialog(null)}>
        <div className="stack" style={{ textAlign: "center" }}>
          <div className="qr"><QRCodeSVG value={m.qr_token} size={220} /></div>
          <div><strong>{m.full_name}</strong><div className="muted">{m.member_number}</div></div>
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="btn ghost" onClick={() => window.print()}>Print</button>
            {can("members:write") && (
              <button className="btn ghost" onClick={async () => {
                if (!confirm("Generate a new QR code? The old one stops working.")) return;
                setData(await api<MemberDetail>(`/members/${m.id}/regenerate-qr`, { body: {} }));
              }}>Replace lost pass</button>
            )}
          </div>
        </div>
      </Modal>
      <p style={{ marginTop: "1.5rem" }}><Link href="/members">← All members</Link></p>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <MemberPage />
    </Suspense>
  );
}
