"use client";

import {
  CalendarCheck01, CheckCircle, CreditCard02, Edit05, Mail01, Phone, Printer, QrCode01, RefreshCw05,
  ReceiptCheck, Snowflake01, Ticket01, Trash01, Wallet02, XCircle,
} from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppModal } from "@/components/app/app-modal";
import { initials } from "@/components/app/command-menu";
import { useConfirm } from "@/components/app/confirm";
import { Empty } from "@/components/app/empty";
import { PaymentForm, ReasonForm, SellForm } from "@/components/app/forms";
import { MemberForm } from "@/components/app/member-form";
import { Section } from "@/components/app/page-header";
import { Pager } from "@/components/app/pager";
import { Skeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
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
  | { kind: "cancel"; sub: SubscriptionSummary }
  | { kind: "refund"; payment: Payment; refundable: number }
  | { kind: "edit" }
  | { kind: "qr" }
  | null;

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function MembershipCard({ sub, currency, totalDue, actions }: { sub: SubscriptionSummary | null; currency: string; totalDue: string; actions: React.ReactNode }) {
  if (!sub) {
    return (
      <Section title="Membership">
        <Empty icon={Ticket01} title="No membership yet" description="Sell a plan to let this member check in.">{actions}</Empty>
      </Section>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const total = daysBetween(sub.start_date, sub.end_date) + 1;
  const used = Math.min(total, Math.max(0, daysBetween(sub.start_date, today) + 1));
  const left = Math.max(0, daysBetween(today, sub.end_date));
  const paidPct = Number(sub.price) > 0 ? (Number(sub.amount_paid) / Number(sub.price)) * 100 : 100;
  return (
    <Section title="Current membership" actions={actions}>
      <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-primary">{sub.plan_name}</span>
            <StatusBadge value={sub.status} />
          </div>
          <p className="text-sm text-tertiary">{date(sub.start_date)} → {date(sub.end_date)}</p>
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-secondary">{sub.status === "upcoming" ? "Starts soon" : `${left} days left`}</span>
              <span className="text-tertiary">{used}/{total} days</span>
            </div>
            <ProgressBarBase value={(used / total) * 100} />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
          <div className="flex items-center justify-between text-sm">
            <span className="text-tertiary">Price{Number(sub.discount) > 0 && ` (−${money(sub.discount, currency)})`}</span>
            <span className="font-semibold text-primary">{money(sub.price, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-tertiary">Paid</span>
            <span className="font-semibold text-primary">{money(sub.amount_paid, currency)}</span>
          </div>
          <ProgressBarBase value={paidPct} progressClassName={paidPct >= 100 ? "bg-fg-success-secondary" : undefined} />
          {Number(totalDue) > 0 ? (
            <p className="text-sm font-semibold text-error-primary">{money(totalDue, currency)} due</p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success-primary"><CheckCircle className="size-4" /> Fully paid</p>
          )}
        </div>
      </div>
    </Section>
  );
}

function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const confirm = useConfirm();
  const { can, me } = useAuth();
  const c = me?.currency ?? "INR";
  const member = useApi<MemberDetail>(`/members/${id}`);
  const [payPage, setPayPage] = useState(1);
  const [visitPage, setVisitPage] = useState(1);
  const payments = useApi<Page<Payment>>(can("payments:read") ? `/payments${qs({ member_id: id, page: payPage, page_size: 10 })}` : null);
  const visits = useApi<Page<AttendanceRecord>>(`/members/${id}/attendance${qs({ page: visitPage, page_size: 10 })}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<string>("memberships");
  const m = member.data;

  useEffect(() => {
    if (params.get("sell") === "1" && can("subscriptions:write")) {
      setDialog({ kind: "sell" });
      router.replace(`/members/${id}`);
    }
  }, [params, id, router, can]);

  const refresh = () => {
    setDialog(null);
    member.reload();
    payments.reload();
    visits.reload();
  };

  async function checkIn() {
    const r = await api<{ allowed: boolean; message: string; code: string }>("/attendance/check-in", { body: { member_id: id } });
    if (r.allowed) toast.success(r.code === "duplicate" ? "Already checked in" : "Checked in", { description: r.message });
    else toast.error("Check-in refused", { description: r.message });
    visits.reload();
  }

  async function unfreeze(sub: SubscriptionSummary) {
    if (!(await confirm({ title: "Unfreeze membership?", description: "Access resumes today and the end date is pushed out by the days frozen, up to the plan's allowance.", confirmLabel: "Unfreeze" }))) return;
    try {
      const s = await api<SubscriptionSummary>(`/subscriptions/${sub.id}/unfreeze`, { body: {} });
      toast.success("Membership resumed", { description: `Now ends ${date(s.end_date)}` });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (member.error) return <div className="rounded-lg bg-error-primary p-4 text-sm text-error-primary">{member.error}</div>;
  if (!m) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4"><Skeleton className="size-16 rounded-full" /><div className="flex flex-col gap-2"><Skeleton className="h-6 w-56" /><Skeleton className="w-40" /></div></div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const cur = m.current_subscription;
  const refundedOf = (pid: string) => (payments.data?.items ?? []).filter((p) => p.refund_of_id === pid).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
            <Avatar size="2xl" initials={initials(m.full_name)} alt={m.full_name} />
          </motion.div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display-xs font-semibold text-primary">{m.full_name}</h1>
              <StatusBadge value={m.membership_status} size="md" />
              {m.status !== "active" && <StatusBadge value={m.status} size="md" />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tertiary">
              <span className="font-medium text-secondary">{m.member_number}</span>
              <a href={`tel:${m.phone}`} className="flex items-center gap-1 hover:text-secondary"><Phone className="size-4" />{m.phone}</a>
              {m.email && <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-secondary"><Mail01 className="size-4" />{m.email}</a>}
              <span>Member since {date(m.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can("payments:create") && Number(m.total_balance_due) > 0 && (
            <Button color="secondary" iconLeading={Wallet02} onClick={() => setDialog({ kind: "pay", sub: cur && Number(cur.balance_due) > 0 ? cur : m.subscriptions.find((s) => Number(s.balance_due) > 0 && s.status !== "cancelled") ?? null })}>
              Collect {money(m.total_balance_due, c)}
            </Button>
          )}
          {can("attendance:checkin") && <Button iconLeading={CalendarCheck01} onClick={checkIn}>Check in</Button>}
          <Dropdown.Root>
            <Dropdown.DotsButton />
            <Dropdown.Popover className="w-56">
              <Dropdown.Menu onAction={(key) => {
                if (key === "qr") setDialog({ kind: "qr" });
                if (key === "edit") setDialog({ kind: "edit" });
                if (key === "sell") setDialog({ kind: "sell" });
                if (key === "pay") setDialog({ kind: "pay", sub: null });
              }}>
                <Dropdown.Item id="qr" icon={QrCode01} label="Show QR pass" />
                {can("members:write") && <Dropdown.Item id="edit" icon={Edit05} label="Edit details" />}
                {can("subscriptions:write") && <Dropdown.Item id="sell" icon={Ticket01} label="Sell membership" />}
                {can("payments:create") && <Dropdown.Item id="pay" icon={CreditCard02} label="Record other payment" />}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <MembershipCard
            sub={cur}
            currency={c}
            totalDue={m.total_balance_due}
            actions={can("subscriptions:write") && (
              cur && cur.status !== "cancelled"
                ? <Button size="sm" iconLeading={RefreshCw05} onClick={() => setDialog({ kind: "renew", sub: cur })}>Renew</Button>
                : <Button size="sm" iconLeading={Ticket01} onClick={() => setDialog({ kind: "sell" })}>Sell membership</Button>
            )}
          />

          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
            <TabList
              type="underline"
              size="md"
              items={[
                { id: "memberships", label: "Memberships", badge: m.subscriptions.length || undefined },
                ...(can("payments:read") ? [{ id: "payments", label: "Payments", badge: payments.data?.total || undefined }] : []),
                { id: "visits", label: "Visits", badge: visits.data?.total || undefined },
              ]}
            />
          </Tabs>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {tab === "memberships" && (
                <Section>
                  {m.subscriptions.length === 0 ? (
                    <Empty icon={Ticket01} title="No memberships" description="Their membership history will show here." />
                  ) : (
                    <ul className="stagger divide-y divide-secondary">
                      {m.subscriptions.map((s, i) => (
                        <li key={s.id} style={{ "--i": i } as React.CSSProperties} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center md:px-6">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-primary">{s.plan_name}</span>
                              <StatusBadge value={s.status} />
                              {s.status !== "cancelled" && <StatusBadge value={s.payment_status} />}
                            </div>
                            <p className="mt-0.5 text-sm text-tertiary">
                              {date(s.start_date)} → {date(s.end_date)} · {money(s.price, c)}
                              {Number(s.balance_due) > 0 && s.status !== "cancelled" && <span className="font-medium text-error-primary"> · {money(s.balance_due, c)} due</span>}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {s.status !== "cancelled" && Number(s.balance_due) > 0 && can("payments:create") && (
                              <Button size="sm" onClick={() => setDialog({ kind: "pay", sub: s })}>Collect</Button>
                            )}
                            {s.status !== "cancelled" && can("subscriptions:write") && (
                              <Button size="sm" color="secondary" onClick={() => setDialog({ kind: "renew", sub: s })}>Renew</Button>
                            )}
                            {s.status === "active" && can("subscriptions:write") && (
                              <Button size="sm" color="secondary" iconLeading={Snowflake01} onClick={() => setDialog({ kind: "freeze", sub: s })}>Freeze</Button>
                            )}
                            {s.status === "frozen" && can("subscriptions:write") && (
                              <Button size="sm" color="secondary" onClick={() => unfreeze(s)}>Unfreeze</Button>
                            )}
                            {s.status !== "cancelled" && can("subscriptions:cancel") && (
                              <Button size="sm" color="tertiary-destructive" iconLeading={XCircle} onClick={() => setDialog({ kind: "cancel", sub: s })} aria-label="Cancel membership" />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {tab === "payments" && (
                <Section>
                  {!payments.data ? (
                    <div className="flex flex-col gap-4 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : payments.data.items.length === 0 ? (
                    <Empty icon={ReceiptCheck} title="No payments" description="Payments and refunds will show here." />
                  ) : (
                    <>
                      <ul className="stagger divide-y divide-secondary">
                        {payments.data.items.map((p, i) => {
                          const refundable = p.kind === "payment" ? Number(p.amount) - refundedOf(p.id) : 0;
                          return (
                            <li key={p.id} style={{ "--i": i } as React.CSSProperties} className="flex items-center gap-3 px-4 py-3 md:px-6">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-primary">{p.receipt?.number ?? "Refund"}</span>
                                  <StatusBadge value={p.method} />
                                  {p.kind === "refund" && <StatusBadge value="refund" />}
                                </div>
                                <p className="truncate text-sm text-tertiary">{dateTime(p.paid_at, me?.timezone)}{(p.reference || p.notes) && ` · ${p.reference ?? p.notes}`}</p>
                              </div>
                              <span className={`text-md font-semibold tabular-nums ${p.kind === "refund" ? "text-error-primary" : "text-primary"}`}>
                                {p.kind === "refund" ? "−" : ""}{money(p.amount, c)}
                              </span>
                              {refundable > 0 && can("payments:refund") && (
                                <Button size="sm" color="tertiary" onClick={() => setDialog({ kind: "refund", payment: p, refundable })}>Refund</Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <Pager page={payments.data.page} pageSize={payments.data.page_size} total={payments.data.total} onPage={setPayPage} />
                    </>
                  )}
                </Section>
              )}

              {tab === "visits" && (
                <Section>
                  {!visits.data ? (
                    <div className="flex flex-col gap-4 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : visits.data.items.length === 0 ? (
                    <Empty icon={CalendarCheck01} title="No visits yet" description="Check-ins will show here." />
                  ) : (
                    <>
                      <ul className="stagger divide-y divide-secondary">
                        {visits.data.items.map((a, i) => (
                          <li key={a.id} style={{ "--i": i } as React.CSSProperties} className="flex items-center gap-3 px-4 py-3 md:px-6">
                            <CalendarCheck01 className="size-5 text-fg-quaternary" />
                            <span className="flex-1 text-sm text-primary">{dateTime(a.check_in_at, me?.timezone)}</span>
                            <span className="text-sm text-tertiary capitalize">{a.method.replace("_", " ")}</span>
                            {a.override_reason && <StatusBadge value="override" />}
                          </li>
                        ))}
                      </ul>
                      <Pager page={visits.data.page} pageSize={visits.data.page_size} total={visits.data.total} onPage={setVisitPage} />
                    </>
                  )}
                </Section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Details" actions={can("members:write") && <Button size="sm" color="tertiary" iconLeading={Edit05} onClick={() => setDialog({ kind: "edit" })}>Edit</Button>}>
            <dl className="flex flex-col gap-4 p-4 text-sm md:p-6">
              {[
                ["Date of birth", date(m.date_of_birth)],
                ["Gender", m.gender ?? "—"],
                ["Address", m.address ?? "—"],
                ["Emergency", m.emergency_contact_name ? `${m.emergency_contact_name}${m.emergency_contact_phone ? ` · ${m.emergency_contact_phone}` : ""}` : "—"],
                ...(m.notes ? [["Notes", m.notes]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-tertiary">{k}</dt>
                  <dd className="mt-0.5 font-medium text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title="QR pass">
            <button className="group flex w-full flex-col items-center gap-3 p-6 outline-focus-ring focus-visible:outline-2" onClick={() => setDialog({ kind: "qr" })}>
              <div className="rounded-xl bg-white p-3 shadow-xs ring-1 ring-secondary transition-transform group-hover:scale-[1.03]">
                <QRCodeSVG value={m.qr_token} size={132} />
              </div>
              <span className="text-sm font-semibold text-brand-secondary">Open to print</span>
            </button>
          </Section>
        </aside>
      </div>

      <AppModal open={dialog?.kind === "sell"} onClose={() => setDialog(null)} title="Sell membership" description={`For ${m.full_name}`} icon={Ticket01} width="max-w-2xl">
        <SellForm memberId={m.id} onDone={refresh} onCancel={() => setDialog(null)} />
      </AppModal>
      <AppModal open={dialog?.kind === "renew"} onClose={() => setDialog(null)} title="Renew membership" description={`For ${m.full_name}`} icon={RefreshCw05} width="max-w-2xl">
        {dialog?.kind === "renew" && <SellForm memberId={m.id} renewFrom={dialog.sub} onDone={refresh} onCancel={() => setDialog(null)} />}
      </AppModal>
      <AppModal open={dialog?.kind === "pay"} onClose={() => setDialog(null)} title="Record payment" description={`From ${m.full_name}`} icon={Wallet02} tone="success">
        {dialog?.kind === "pay" && <PaymentForm memberId={m.id} subscription={dialog.sub} onDone={refresh} onCancel={() => setDialog(null)} />}
      </AppModal>
      <AppModal open={dialog?.kind === "freeze"} onClose={() => setDialog(null)} title="Freeze membership" description="Check-in is blocked while frozen. Unfreezing extends the end date." icon={Snowflake01} tone="gray">
        {dialog?.kind === "freeze" && (
          <ReasonForm reasonLabel="Reason" submitLabel="Freeze" dateLabel="Freeze from" onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              await api(`/subscriptions/${dialog.sub.id}/freeze`, { body: { start_date: v.date, reason: v.reason || null } });
              toast.success("Membership frozen");
              refresh();
            }} />
        )}
      </AppModal>
      <AppModal open={dialog?.kind === "cancel"} onClose={() => setDialog(null)} title="Cancel membership" description="Access ends immediately. Payments stay on record — issue refunds separately." icon={Trash01} tone="error">
        {dialog?.kind === "cancel" && (
          <ReasonForm destructive requireReason reasonLabel="Reason" submitLabel="Cancel membership" onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              await api(`/subscriptions/${dialog.sub.id}/cancel`, { body: { reason: v.reason } });
              toast.success("Membership cancelled");
              refresh();
            }} />
        )}
      </AppModal>
      <AppModal open={dialog?.kind === "refund"} onClose={() => setDialog(null)} title="Refund payment" description="A separate refund entry is recorded. The original payment is kept." icon={ReceiptCheck} tone="warning">
        {dialog?.kind === "refund" && (
          <ReasonForm destructive requireReason reasonLabel="Reason" submitLabel="Record refund" refundable={money(dialog.refundable, c)} onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              await api(`/payments/${dialog.payment.id}/refund`, { body: { reason: v.reason, amount: v.amount || null } });
              toast.success("Refund recorded");
              refresh();
            }} />
        )}
      </AppModal>
      <AppModal open={dialog?.kind === "edit"} onClose={() => setDialog(null)} title="Edit member" icon={Edit05} width="max-w-3xl">
        <MemberForm compact initial={m} onCancel={() => setDialog(null)}
          onSaved={(nm) => { member.setData(nm); setDialog(null); toast.success("Changes saved"); }} />
      </AppModal>
      <AppModal open={dialog?.kind === "qr"} onClose={() => setDialog(null)} title="Member QR pass" description="Scan at the front desk to check in." icon={QrCode01} width="max-w-sm">
        <div className="flex flex-col items-center gap-4">
          <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-secondary">
            <QRCodeSVG value={m.qr_token} size={220} />
          </motion.div>
          <div className="text-center">
            <p className="text-lg font-semibold text-primary">{m.full_name}</p>
            <p className="text-sm text-tertiary">{m.member_number}</p>
          </div>
          <div className="mt-2 grid w-full grid-cols-2 gap-3 no-print">
            <Button color="secondary" iconLeading={Printer} onClick={() => window.print()}>Print</Button>
            {can("members:write") && (
              <Button color="secondary-destructive" iconLeading={RefreshCw05} onClick={async () => {
                if (!(await confirm({ title: "Replace QR pass?", description: "The current pass stops working immediately.", confirmLabel: "Replace", destructive: true }))) return;
                member.setData(await api<MemberDetail>(`/members/${m.id}/regenerate-qr`, { body: {} }));
                toast.success("New QR pass generated");
              }}>Replace</Button>
            )}
          </div>
        </div>
      </AppModal>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <MemberPage />
    </Suspense>
  );
}
