"use client";

import Link from "next/link";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { DashboardSummary } from "@/lib/types";

export default function Dashboard() {
  const { me, can } = useAuth();
  const { data: d, error } = useApi<DashboardSummary>("/dashboard/summary");
  const c = d?.currency ?? me?.currency ?? "INR";

  return (
    <>
      <PageHeader
        title={`Hello, ${me?.name.split(" ")[0]}`}
        subtitle={d ? `${me?.organization_name} · ${date(d.date)}` : undefined}
        actions={
          <>
            {can("attendance:checkin") && <Link className="btn" href="/desk">Front desk</Link>}
            {can("members:write") && <Link className="btn ghost" href="/members/new">New member</Link>}
          </>
        }
      />
      {error && <div className="alert error">{error}</div>}
      {d && (
        <div className="stack">
          <div className="grid stats">
            <Stat label="Active members" value={d.active_members} hint={`${d.total_members} on record`} />
            <Stat label="Check-ins today" value={d.checkins_today} />
            <Stat label="Collected today" value={money(d.collections_today, c)} />
            <Stat label="Collected this month" value={money(d.collections_this_month, c)} />
            <Stat label="New this month" value={d.new_members_this_month} />
            <Stat label="Frozen" value={d.frozen_members} />
            <Stat label="Outstanding dues" value={money(d.outstanding_dues, c)} tone={Number(d.outstanding_dues) > 0 ? "bad" : ""} />
            <Stat label="Expiring in 7 days" value={d.expiring_next_7_days} />
          </div>
          <section className="card flush">
            <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}>
              <h2>Expiring soon</h2>
              {can("reports:read") && <Link href="/reports?tab=expiring">See all</Link>}
            </div>
            {d.expiring_soon.length === 0 ? (
              <Empty>No memberships expire in the next 7 days.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Member</th><th>Phone</th><th>Plan</th><th>Ends</th><th className="num">Due</th></tr></thead>
                  <tbody>
                    {d.expiring_soon.map((e) => (
                      <tr key={e.subscription_id}>
                        <td><Link href={`/members/${e.member_id}`}>{e.member_name}</Link> <span className="muted">{e.member_number}</span></td>
                        <td>{e.phone}</td>
                        <td>{e.plan_name}</td>
                        <td>{date(e.end_date)}</td>
                        <td className="num">{Number(e.balance_due) > 0 ? <Badge value="unpaid" label={money(e.balance_due, c)} /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
