"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Empty, PageHeader, Pager } from "@/components/ui";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Member, Page } from "@/lib/types";

export default function Members() {
  const { can } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error } = useApi<Page<Member>>(`/members${qs({ q, status, page })}`);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={data ? `${data.total} members` : undefined}
        actions={can("members:write") && <Link className="btn" href="/members/new">New member</Link>}
      />
      <div className="row gap" style={{ marginBottom: "1rem" }}>
        <input style={{ flex: 1, minWidth: 220 }} placeholder="Search name, phone, email or member number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select style={{ width: 180 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All accounts</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="card flush">
        {data?.items.length === 0 ? <Empty>No members found.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>No.</th><th>Name</th><th>Phone</th><th>Membership</th><th>Valid until</th><th>Account</th></tr></thead>
              <tbody>
                {data?.items.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => router.push(`/members/${m.id}`)}>
                    <td className="mono">{m.member_number}</td>
                    <td><Link href={`/members/${m.id}`}>{m.full_name}</Link></td>
                    <td>{m.phone}</td>
                    <td><Badge value={m.membership_status} /></td>
                    <td>{date(m.membership_end_date)}</td>
                    <td>{m.status !== "active" ? <Badge value={m.status} /> : <span className="muted">active</span>}</td>
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
