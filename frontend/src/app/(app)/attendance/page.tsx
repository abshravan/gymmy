"use client";

import { CalendarCheck01 } from "@untitledui/icons";
import { useState } from "react";
import { initials } from "@/components/app/command-menu";
import { DateRangeField } from "@/components/app/date-field";
import { Empty } from "@/components/app/empty";
import { PageHeader, Section } from "@/components/app/page-header";
import { Pager } from "@/components/app/pager";
import { TableSkeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Table } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, todayISO } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { AttendanceRecord, Page } from "@/lib/types";
import { cx } from "@/utils/cx";

export default function AttendancePage() {
  const { me } = useAuth();
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<Page<AttendanceRecord>>(`/attendance${qs({ date_from: range.from, date_to: range.to, page, page_size: 25 })}`);

  return (
    <>
      <PageHeader
        title="Attendance"
        description={data ? `${data.total.toLocaleString("en-IN")} check-ins in this range` : " "}
        actions={<DateRangeField from={range.from} to={range.to} onChange={(from, to) => { setRange({ from, to }); setPage(1); }} />}
      />
      <Section>
        {!data ? (
          <TableSkeleton cols={4} />
        ) : data.items.length === 0 ? (
          <Empty icon={CalendarCheck01} title="No check-ins" description="Nobody checked in during this period." />
        ) : (
          <div className={cx("transition-opacity", loading && "opacity-60")}>
            <Table aria-label="Attendance">
              <Table.Header>
                <Table.Head id="member" label="Member" isRowHeader />
                <Table.Head id="in" label="Checked in" />
                <Table.Head id="method" label="Method" className="max-md:hidden" />
                <Table.Head id="note" label="Note" className="max-lg:hidden" />
              </Table.Header>
              <Table.Body items={data.items}>
                {(a) => (
                  <Table.Row id={a.id} href={`/members/${a.member_id}`} className="cursor-pointer">
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm" initials={initials(a.member_name)} alt={a.member_name} />
                        <div>
                          <p className="text-sm font-medium text-primary">{a.member_name}</p>
                          <p className="text-xs text-tertiary">{a.member_number}</p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{dateTime(a.check_in_at, me?.timezone)}</Table.Cell>
                    <Table.Cell className="capitalize max-md:hidden">{a.method.replace("_", " ")}</Table.Cell>
                    <Table.Cell className="max-lg:hidden">
                      {a.override_reason ? <div className="flex items-center gap-2"><StatusBadge value="override" /><span className="truncate text-tertiary">{a.override_reason}</span></div> : "—"}
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
