"use client";

import { AlertCircle, CalendarCheck01, Clock, Coins03, Hourglass03, PauseCircle, QrCode01, UserPlus01, Users01, Wallet02 } from "@untitledui/icons";
import Link from "next/link";
import { useMemo } from "react";
import { initials } from "@/components/app/command-menu";
import { Empty } from "@/components/app/empty";
import { PageHeader, Section } from "@/components/app/page-header";
import { Skeleton } from "@/components/app/skeleton";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { LazyTrendChart as TrendChart } from "@/components/app/lazy-chart";
import { fillDays } from "@/components/app/fill-days";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { AttendanceRecord, DashboardSummary, Page } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function daysFrom(iso: string, offset: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { me, can } = useAuth();
  const { data: d, error } = useApi<DashboardSummary>("/dashboard/summary");
  const c = d?.currency ?? me?.currency ?? "INR";
  const fmtMoney = useMemo(() => (n: number) => money(n, c), [c]);
  const today = d?.date;
  const from = today ? daysFrom(today, -13) : null;
  const rev = useApi<{ by_day: { date: string; net: string }[]; net: string }>(
    can("reports:read") && today && from ? `/reports/revenue${qs({ date_from: from, date_to: today })}` : null,
  );
  const visits = useApi<Page<AttendanceRecord>>(
    can("attendance:read") && today ? `/attendance${qs({ date_from: today, date_to: today, page_size: 6 })}` : null,
  );
  const series = useMemo(
    () => (rev.data && from && today ? fillDays(rev.data.by_day.map((p) => ({ date: p.date, value: Number(p.net) })), from, today) : []),
    [rev.data, from, today],
  );

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me?.name.split(" ")[0]}`}
        description={d ? `Here's ${me?.organization_name} today, ${date(d.date)}.` : " "}
        actions={
          <>
            {can("members:write") && <Button color="secondary" iconLeading={UserPlus01} href="/members/new">New member</Button>}
            {can("attendance:checkin") && <Button iconLeading={QrCode01} href="/desk">Check in</Button>}
          </>
        }
      />
      {error && <div className="mb-6 rounded-lg bg-error-primary p-4 text-sm text-error-primary">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d ? (
          <>
            <StatCard index={0} label="Active members" value={d.active_members} icon={Users01} hint={`${d.total_members} on record · ${d.new_members_this_month} new this month`} />
            <StatCard index={1} label="Check-ins today" value={d.checkins_today} icon={CalendarCheck01} tone="success" />
            <StatCard index={2} label="Collected today" value={Number(d.collections_today)} format={fmtMoney} icon={Coins03} tone="brand"
              hint={`${money(d.collections_this_month, c)} this month`} />
            <StatCard index={3} label="Outstanding dues" value={Number(d.outstanding_dues)} format={fmtMoney} icon={Wallet02}
              tone={Number(d.outstanding_dues) > 0 ? "error" : "gray"} emphasis="error"
              hint={can("reports:read") ? <Link className="font-semibold text-brand-secondary hover:underline" href="/reports?tab=dues">View dues</Link> : undefined} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[154px] rounded-xl" />)
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        {can("reports:read") ? (
          <Section title="Collections" description="Net of refunds, last 14 days" actions={rev.data && <span className="text-lg font-semibold text-primary">{money(rev.data.net, c)}</span>}>
            <div className="px-2 pt-4 pb-2 md:px-4">
              {rev.data ? <TrendChart data={series} format={fmtMoney} label="Collected" /> : <Skeleton className="m-4 h-[220px]" />}
            </div>
          </Section>
        ) : (
          <Section title="Today's check-ins" description="Latest visits at the desk">
            <VisitList visits={visits.data?.items} tz={me?.timezone} />
          </Section>
        )}

        <Section
          title="Expiring soon"
          description="Next 7 days — a good time to call"
          actions={can("reports:read") && <Button color="link-color" size="sm" href="/reports?tab=expiring">View all</Button>}
        >
          {!d ? (
            <div className="flex flex-col gap-4 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : d.expiring_soon.length === 0 ? (
            <Empty icon={Hourglass03} title="Nothing expiring" description="No memberships end in the next 7 days." />
          ) : (
            <ul className="stagger divide-y divide-secondary">
              {d.expiring_soon.map((e, i) => (
                <li key={e.subscription_id} style={{ "--i": i } as React.CSSProperties}>
                  <Link href={`/members/${e.member_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary_hover md:px-6">
                    <Avatar size="md" initials={initials(e.member_name)} alt={e.member_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">{e.member_name}</p>
                      <p className="truncate text-sm text-tertiary">{e.plan_name} · ends {date(e.end_date)}</p>
                    </div>
                    {Number(e.balance_due) > 0 && <StatusBadge value="unpaid" label={money(e.balance_due, c)} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {can("reports:read") && can("attendance:read") && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Today's check-ins" description="Latest visits at the desk"
            actions={<Button color="link-color" size="sm" href="/attendance">All attendance</Button>}>
            <VisitList visits={visits.data?.items} tz={me?.timezone} />
          </Section>
          {d && (
            <Section title="At a glance">
              <dl className="grid grid-cols-2 divide-secondary">
                {[
                  { icon: UserPlus01, label: "New this month", value: d.new_members_this_month },
                  { icon: PauseCircle, label: "Frozen", value: d.frozen_members },
                  { icon: Clock, label: "Expiring in 7 days", value: d.expiring_next_7_days },
                  { icon: AlertCircle, label: "Not active", value: Math.max(0, d.total_members - d.active_members - d.frozen_members) },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 border-b border-secondary px-6 py-5 odd:border-r">
                    <s.icon className="size-5 text-fg-quaternary" />
                    <div>
                      <dt className="text-sm text-tertiary">{s.label}</dt>
                      <dd className="text-xl font-semibold text-primary tabular-nums">{s.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function VisitList({ visits, tz }: { visits?: AttendanceRecord[]; tz?: string | null }) {
  if (!visits) return <div className="flex flex-col gap-4 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (visits.length === 0) return <Empty icon={CalendarCheck01} title="No check-ins yet" description="Visits show up here as members arrive." />;
  return (
    <ul className="stagger divide-y divide-secondary">
      {visits.map((a, i) => (
        <li key={a.id} style={{ "--i": i } as React.CSSProperties}>
          <Link href={`/members/${a.member_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary_hover md:px-6">
            <Avatar size="sm" initials={initials(a.member_name)} alt={a.member_name} />
            <span className="flex-1 truncate text-sm font-medium text-primary">{a.member_name}</span>
            {a.override_reason && <StatusBadge value="override" />}
            <span className="text-sm text-tertiary tabular-nums">{dateTime(a.check_in_at, tz).split(", ").pop()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
