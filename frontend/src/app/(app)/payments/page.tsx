"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, Field, PageHeader, Pager } from "@/components/ui";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Page, Payment } from "@/lib/types";

export default function Payments() {
  const { me } = useAuth();
  const [filters, setFilters] = useState({ date_from: "", date_to: "", method: "", kind: "" });
  const [page, setPage] = useState(1);
  const { data } = useApi<Page<Payment>>(`/payments${qs({ ...filters, page })}`);
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment and refund. Refunds are separate entries; originals are never edited." />
      <div className="form-grid" style={{ marginBottom: "1rem" }}>
        <Field label="From"><input type="date" value={filters.date_from} onChange={set("date_from")} /></Field>
        <Field label="To"><input type="date" value={filters.date_to} onChange={set("date_to")} /></Field>
        <Field label="Method">
          <select value={filters.method} onChange={set("method")}>
            <option value="">All</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option>
          </select>
        </Field>
        <Field label="Type">
          <select value={filters.kind} onChange={set("kind")}><option value="">All</option><option value="payment">Payments</option><option value="refund">Refunds</option></select>
        </Field>
      </div>
      <section className="card flush">
        {data?.items.length === 0 ? <Empty>No payments match.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Receipt</th><th>Type</th><th>Method</th><th>Reference</th><th>Member</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>{dateTime(p.paid_at, me?.timezone)}</td>
                    <td className="mono">{p.receipt?.number ?? "—"}</td>
                    <td><Badge value={p.kind} /></td>
                    <td>{p.method.replace("_", " ")}</td>
                    <td>{p.reference ?? p.notes ?? "—"}</td>
                    <td><Link href={`/members/${p.member_id}`}>View</Link></td>
                    <td className="num">{p.kind === "refund" ? "−" : ""}{money(p.amount, me?.currency ?? "INR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      </section>
    </>
  );
}
