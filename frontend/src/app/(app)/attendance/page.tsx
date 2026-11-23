"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, Field, PageHeader, Pager } from "@/components/ui";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, todayISO } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { AttendanceRecord, Page } from "@/lib/types";

export default function AttendancePage() {
  const { me } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [page, setPage] = useState(1);
  const { data } = useApi<Page<AttendanceRecord>>(`/attendance${qs({ date_from: from, date_to: to, page })}`);

  return (
    <>
      <PageHeader title="Attendance" subtitle={data ? `${data.total} check-ins in range` : undefined} />
      <div className="form-grid" style={{ marginBottom: "1rem", maxWidth: 480 }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
      </div>
      <section className="card flush">
        {data?.items.length === 0 ? <Empty>No check-ins in this range.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Checked in</th><th>Checked out</th><th>Member</th><th>Method</th><th>Note</th></tr></thead>
              <tbody>
                {data?.items.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.check_in_at, me?.timezone)}</td>
                    <td>{dateTime(a.check_out_at, me?.timezone)}</td>
                    <td><Link href={`/members/${a.member_id}`}>{a.member_name}</Link> <span className="muted">{a.member_number}</span></td>
                    <td>{a.method.replace("_", " ")}</td>
                    <td>{a.override_reason ? <><Badge value="partial" label="override" /> <span className="muted">{a.override_reason}</span></> : ""}</td>
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
