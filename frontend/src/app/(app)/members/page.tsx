"use client";

import { SearchLg, UserPlus01, Users01 } from "@untitledui/icons";
import { useState } from "react";
import { initials } from "@/components/app/command-menu";
import { Empty } from "@/components/app/empty";
import { Segmented } from "@/components/app/fields";
import { PageHeader, Section } from "@/components/app/page-header";
import { Pager } from "@/components/app/pager";
import { TableSkeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Table } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Member, Page } from "@/lib/types";
import { cx } from "@/utils/cx";

export default function Members() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, loading } = useApi<Page<Member>>(`/members${qs({ q, status, page, page_size: 20 })}`);

  return (
    <>
      <PageHeader
        title="Members"
        description={data ? `${data.total.toLocaleString("en-IN")} ${status || "total"} members` : " "}
        actions={can("members:write") && <Button iconLeading={UserPlus01} href="/members/new">New member</Button>}
      />
      {error && <div className="mb-6 rounded-lg bg-error-primary p-4 text-sm text-error-primary">{error}</div>}
      <Section>
        <div className="flex flex-col gap-3 border-b border-secondary p-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Segmented
            className="md:w-[420px]"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <Input className="md:w-80" icon={SearchLg} placeholder="Search name, phone, number" value={search}
            onChange={(v) => { setSearch(v); setPage(1); }} aria-label="Search members" />
        </div>
        {!data ? (
          <TableSkeleton cols={5} />
        ) : data.items.length === 0 ? (
          <Empty icon={q ? SearchLg : Users01} title={q ? "No members found" : "No members yet"}
            description={q ? `Nothing matches “${q}”. Try a phone number or member number.` : "Register your first member to get started."}>
            {can("members:write") && <Button iconLeading={UserPlus01} href="/members/new">New member</Button>}
          </Empty>
        ) : (
          <div className={cx("transition-opacity duration-200", loading && "opacity-60")}>
            <Table aria-label="Members">
              <Table.Header>
                <Table.Head id="name" label="Member" isRowHeader />
                <Table.Head id="phone" label="Phone" className="max-md:hidden" />
                <Table.Head id="membership" label="Membership" />
                <Table.Head id="until" label="Valid until" className="max-sm:hidden" />
                <Table.Head id="account" label="Account" className="max-lg:hidden" />
              </Table.Header>
              <Table.Body items={data.items}>
                {(m) => (
                  <Table.Row id={m.id} href={`/members/${m.id}`} className="cursor-pointer">
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <Avatar size="md" initials={initials(m.full_name)} alt={m.full_name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-primary">{m.full_name}</p>
                          <p className="text-sm text-tertiary">{m.member_number}</p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="max-md:hidden">{m.phone}</Table.Cell>
                    <Table.Cell><StatusBadge value={m.membership_status} /></Table.Cell>
                    <Table.Cell className="max-sm:hidden">{date(m.membership_end_date)}</Table.Cell>
                    <Table.Cell className="max-lg:hidden">{m.status === "active" ? <span className="text-tertiary">Active</span> : <StatusBadge value={m.status} />}</Table.Cell>
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
