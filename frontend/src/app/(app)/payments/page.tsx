"use client";

import { ReceiptCheck } from "@untitledui/icons";
import { useState } from "react";
import { DateRangeField } from "@/components/app/date-field";
import { Empty } from "@/components/app/empty";
import { Segmented, SelectField } from "@/components/app/fields";
import { PageHeader, Section } from "@/components/app/page-header";
import { Pager } from "@/components/app/pager";
import { TableSkeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Page, Payment } from "@/lib/types";
import { cx } from "@/utils/cx";

export default function Payments() {
  const { me } = useAuth();
  const [f, setF] = useState({ date_from: "", date_to: "", method: "", kind: "" });
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<Page<Payment>>(`/payments${qs({ ...f, page, page_size: 20 })}`);
  const update = (patch: Partial<typeof f>) => { setF((s) => ({ ...s, ...patch })); setPage(1); };
  const filtered = Object.values(f).some(Boolean);
  const c = me?.currency ?? "INR";

  return (
    <>
      <PageHeader title="Payments" description="Every payment and refund. Refunds are separate entries — originals are never edited." />
      <Section>
        <div className="flex flex-col gap-3 border-b border-secondary p-4 lg:flex-row lg:items-center md:px-6">
          <Segmented className="lg:w-72" value={f.kind} onChange={(v) => update({ kind: v })}
            options={[{ value: "", label: "All" }, { value: "payment", label: "Payments" }, { value: "refund", label: "Refunds" }]} />
          <SelectField className="lg:w-48" placeholder="Any method" value={f.method} onChange={(v) => update({ method: v })}
            options={[{ value: "", label: "Any method" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank_transfer", label: "Bank transfer" }]} />
          <DateRangeField from={f.date_from} to={f.date_to} onChange={(a, b) => update({ date_from: a, date_to: b })} />
          {filtered && <Button color="link-gray" onClick={() => update({ date_from: "", date_to: "", method: "", kind: "" })}>Clear filters</Button>}
        </div>
        {!data ? (
          <TableSkeleton cols={5} />
        ) : data.items.length === 0 ? (
          <Empty icon={ReceiptCheck} title={filtered ? "No payments match" : "No payments yet"} description={filtered ? "Try widening the date range or clearing filters." : "Payments appear here as soon as they're recorded."} />
        ) : (
          <div className={cx("transition-opacity", loading && "opacity-60")}>
            <Table aria-label="Payments">
              <Table.Header>
                <Table.Head id="receipt" label="Receipt" isRowHeader />
                <Table.Head id="date" label="Date" />
                <Table.Head id="method" label="Method" className="max-md:hidden" />
                <Table.Head id="ref" label="Reference" className="max-lg:hidden" />
                <Table.Head id="amount" label="Amount" className="text-right [&_div]:justify-end" />
              </Table.Header>
              <Table.Body items={data.items}>
                {(p) => (
                  <Table.Row id={p.id} href={`/members/${p.member_id}`} className="cursor-pointer">
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-primary">{p.receipt?.number ?? "—"}</span>
                        {p.kind === "refund" && <StatusBadge value="refund" />}
                      </div>
                    </Table.Cell>
                    <Table.Cell>{dateTime(p.paid_at, me?.timezone)}</Table.Cell>
                    <Table.Cell className="max-md:hidden"><StatusBadge value={p.method} /></Table.Cell>
                    <Table.Cell className="max-w-56 truncate max-lg:hidden">{p.reference ?? p.notes ?? "—"}</Table.Cell>
                    <Table.Cell className={cx("text-right font-semibold tabular-nums", p.kind === "refund" ? "text-error-primary" : "text-primary")}>
                      {p.kind === "refund" ? "−" : ""}{money(p.amount, c)}
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
            <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </div>
        )}
      </Section>
    </>
  );
}
