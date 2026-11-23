"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Empty, Field, PageHeader, Stat } from "@/components/ui";
import { download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, money, todayISO } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ExpiringItem } from "@/lib/types";

interface Revenue {
  collected: string; refunded: string; net: string; payment_count: number; currency: string;
  by_method: { method: string; collected: string; refunded: string; net: string }[];
  by_day: { date: string; net: string }[];
}
interface Attendance { total_checkins: number; unique_members: number; by_day: { date: string; count: number }[] }
interface Due extends ExpiringItem { start_date: string; price: string; amount_paid: string }

const TABS = [
  { id: "revenue", label: "Revenue" },
  { id: "attendance", label: "Attendance" },
  { id: "expiring", label: "Expiring" },
  { id: "dues", label: "Outstanding dues" },
] as const;

function monthStart() {
  return `${todayISO().slice(0, 8)}01`;
}

function Reports() {
  const params = useSearchParams();
  const { me } = useAuth();
  const c = me?.currency ?? "INR";
  const [tab, setTab] = useState<string>(params.get("tab") ?? "revenue");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [days, setDays] = useState(7);
  const range = qs({ date_from: from, date_to: to });
  const rev = useApi<Revenue>(tab === "revenue" ? `/reports/revenue${range}` : null);
  const att = useApi<Attendance>(tab === "attendance" ? `/reports/attendance${range}` : null);
  const exp = useApi<ExpiringItem[]>(tab === "expiring" ? `/reports/expiring?days=${days}` : null);
  const dues = useApi<Due[]>(tab === "dues" ? "/reports/dues" : null);
  const err = rev.error || att.error || exp.error || dues.error;

  return (
    <>
      <PageHeader title="Reports" />
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {err && <div className="alert error">{err}</div>}

      {(tab === "revenue" || tab === "attendance") && (
        <div className="form-grid" style={{ marginBottom: "1rem", maxWidth: 480 }}>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}

      {tab === "revenue" && rev.data && (
        <div className="stack">
          <div className="grid stats">
            <Stat label="Collected" value={money(rev.data.collected, c)} hint={`${rev.data.payment_count} payments`} />
            <Stat label="Refunded" value={money(rev.data.refunded, c)} />
            <Stat label="Net" value={money(rev.data.net, c)} tone="good" />
          </div>
          <div className="grid two">
            <section className="card flush">
              <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}><h2>By method</h2></div>
              {rev.data.by_method.length === 0 ? <Empty>No payments.</Empty> : (
                <table>
                  <thead><tr><th>Method</th><th className="num">Collected</th><th className="num">Refunded</th><th className="num">Net</th></tr></thead>
                  <tbody>{rev.data.by_method.map((m) => (
                    <tr key={m.method}><td>{m.method.replace("_", " ")}</td><td className="num">{money(m.collected, c)}</td><td className="num">{money(m.refunded, c)}</td><td className="num">{money(m.net, c)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <section className="card flush">
              <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}><h2>By day</h2></div>
              {rev.data.by_day.length === 0 ? <Empty>No payments.</Empty> : (
                <table>
                  <thead><tr><th>Date</th><th className="num">Net</th></tr></thead>
                  <tbody>{rev.data.by_day.map((d) => <tr key={d.date}><td>{date(d.date)}</td><td className="num">{money(d.net, c)}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "attendance" && att.data && (
        <div className="stack">
          <div className="grid stats">
            <Stat label="Check-ins" value={att.data.total_checkins} />
            <Stat label="Unique members" value={att.data.unique_members} />
          </div>
          <section className="card flush">
            {att.data.by_day.length === 0 ? <Empty>No check-ins.</Empty> : (
              <table>
                <thead><tr><th>Date</th><th className="num">Check-ins</th></tr></thead>
                <tbody>{att.data.by_day.map((d) => <tr key={d.date}><td>{date(d.date)}</td><td className="num">{d.count}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {tab === "expiring" && (
        <div className="stack">
          <div className="row gap spread">
            <label className="row gap">Expiring within
              <select style={{ width: 120 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <button className="btn ghost" onClick={() => download(`/reports/expiring?days=${days}&format=csv`, "expiring.csv")}>Download CSV</button>
          </div>
          <section className="card flush">
            {exp.data?.length === 0 ? <Empty>Nothing expiring in this window (renewed memberships are excluded).</Empty> : (
              <table>
                <thead><tr><th>Member</th><th>Phone</th><th>Plan</th><th>Ends</th><th className="num">Due</th></tr></thead>
                <tbody>{exp.data?.map((e) => (
                  <tr key={e.subscription_id}>
                    <td><Link href={`/members/${e.member_id}`}>{e.member_name}</Link> <span className="muted">{e.member_number}</span></td>
                    <td>{e.phone}</td><td>{e.plan_name}</td><td>{date(e.end_date)}</td>
                    <td className="num">{Number(e.balance_due) > 0 ? money(e.balance_due, c) : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {tab === "dues" && (
        <div className="stack">
          <div className="row gap spread">
            <span className="muted">
              {dues.data && `${dues.data.length} memberships · ${money(dues.data.reduce((s, d) => s + Number(d.balance_due), 0), c)} outstanding`}
            </span>
            <button className="btn ghost" onClick={() => download("/reports/dues?format=csv", "dues.csv")}>Download CSV</button>
          </div>
          <section className="card flush">
            {dues.data?.length === 0 ? <Empty>No outstanding dues.</Empty> : (
              <table>
                <thead><tr><th>Member</th><th>Phone</th><th>Plan</th><th>Period</th><th className="num">Price</th><th className="num">Paid</th><th className="num">Due</th></tr></thead>
                <tbody>{dues.data?.map((d) => (
                  <tr key={d.subscription_id}>
                    <td><Link href={`/members/${d.member_id}`}>{d.member_name}</Link> <span className="muted">{d.member_number}</span></td>
                    <td>{d.phone}</td><td>{d.plan_name}</td><td>{date(d.start_date)} → {date(d.end_date)}</td>
                    <td className="num">{money(d.price, c)}</td><td className="num">{money(d.amount_paid, c)}</td>
                    <td className="num" style={{ color: "var(--bad)", fontWeight: 600 }}>{money(d.balance_due, c)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="empty">Loading…</div>}><Reports /></Suspense>;
}
