"use client";

import { CalendarCheck01, Coins03, Download01, Hourglass03, ReverseLeft, Users01, Wallet02 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { initials } from "@/components/app/command-menu";
import { DateRangeField } from "@/components/app/date-field";
import { Empty } from "@/components/app/empty";
import { Segmented } from "@/components/app/fields";
import { PageHeader, Section } from "@/components/app/page-header";
import { Skeleton, TableSkeleton } from "@/components/app/skeleton";
import { StatCard } from "@/components/app/stat-card";
import { LazyTrendChart as TrendChart } from "@/components/app/lazy-chart";
import { fillDays } from "@/components/app/fill-days";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { Table } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, money, todayISO } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ExpiringItem } from "@/lib/types";

interface Revenue {
  collected: string; refunded: string; net: string; payment_count: number;
  by_method: { method: string; collected: string; refunded: string; net: string }[];
  by_day: { date: string; net: string }[];
}
interface Attendance { total_checkins: number; unique_members: number; by_day: { date: string; count: number }[] }
interface Due extends ExpiringItem { start_date: string; price: string; amount_paid: string }

const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank transfer" };

function Reports() {
  const params = useSearchParams();
  const { me } = useAuth();
  const c = me?.currency ?? "INR";
  const fmt = useMemo(() => (n: number) => money(n, c), [c]);
  const count = useMemo(() => (n: number) => Math.round(n).toLocaleString("en-IN"), []);
  const [tab, setTab] = useState<string>(params.get("tab") ?? "revenue");
  const [range, setRange] = useState({ from: `${todayISO().slice(0, 8)}01`, to: todayISO() });
  const [days, setDays] = useState("7");
  const r = qs({ date_from: range.from, date_to: range.to });
  const rev = useApi<Revenue>(tab === "revenue" ? `/reports/revenue${r}` : null);
  const att = useApi<Attendance>(tab === "attendance" ? `/reports/attendance${r}` : null);
  const exp = useApi<ExpiringItem[]>(tab === "expiring" ? `/reports/expiring?days=${days}` : null);
  const dues = useApi<Due[]>(tab === "dues" ? "/reports/dues" : null);

  const revSeries = useMemo(() => rev.data ? fillDays(rev.data.by_day.map((d) => ({ date: d.date, value: Number(d.net) })), range.from, range.to) : [], [rev.data, range]);
  const attSeries = useMemo(() => att.data ? fillDays(att.data.by_day.map((d) => ({ date: d.date, value: d.count })), range.from, range.to) : [], [att.data, range]);
  const maxMethod = Math.max(1, ...(rev.data?.by_method.map((m) => Number(m.net)) ?? [1]));

  const csv = async (path: string, name: string) => {
    try {
      await download(path, name);
      toast.success("Download started", { description: name });
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        actions={(tab === "revenue" || tab === "attendance") && (
          <DateRangeField from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        )}
      />
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} className="mb-6">
        <TabList type="button-border" size="sm" className="w-full overflow-x-auto sm:w-max" items={[
          { id: "revenue", label: "Revenue" },
          { id: "attendance", label: "Attendance" },
          { id: "expiring", label: "Expiring" },
          { id: "dues", label: "Outstanding dues" },
        ]} />
      </Tabs>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="flex flex-col gap-6">
          {tab === "revenue" && (rev.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard index={0} label="Collected" value={Number(rev.data.collected)} format={fmt} icon={Coins03} hint={`${rev.data.payment_count} payments`} />
                <StatCard index={1} label="Refunded" value={Number(rev.data.refunded)} format={fmt} icon={ReverseLeft} tone="warning" />
                <StatCard index={2} label="Net" value={Number(rev.data.net)} format={fmt} icon={Wallet02} tone="success" />
              </div>
              <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                <Section title="Net collections by day" description={`${date(range.from)} – ${date(range.to)}`}>
                  <div className="px-2 pt-4 pb-2 md:px-4"><TrendChart data={revSeries} format={fmt} label="Net" height={280} /></div>
                </Section>
                <Section title="By payment method">
                  {rev.data.by_method.length === 0 ? <Empty title="No payments" description="Nothing collected in this range." /> : (
                    <ul className="flex flex-col gap-5 p-4 md:p-6">
                      {rev.data.by_method.map((m) => (
                        <li key={m.method}>
                          <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium text-secondary">{METHOD_LABEL[m.method] ?? m.method}</span>
                            <span className="font-semibold text-primary tabular-nums">{money(m.net, c)}</span>
                          </div>
                          <ProgressBarBase value={(Number(m.net) / maxMethod) * 100} />
                          {Number(m.refunded) > 0 && <p className="mt-1 text-xs text-tertiary">{money(m.refunded, c)} refunded</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            </>
          ) : <Skeleton className="h-96 rounded-xl" />)}

          {tab === "attendance" && (att.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard index={0} label="Check-ins" value={att.data.total_checkins} icon={CalendarCheck01} />
                <StatCard index={1} label="Unique members" value={att.data.unique_members} icon={Users01} tone="success" />
                <StatCard index={2} label="Avg per day" value={attSeries.length ? att.data.total_checkins / attSeries.length : 0} format={(n) => n.toFixed(1)} icon={CalendarCheck01} tone="gray" />
              </div>
              <Section title="Check-ins by day" description={`${date(range.from)} – ${date(range.to)}`}>
                <div className="px-2 pt-4 pb-2 md:px-4"><TrendChart kind="bar" data={attSeries} format={count} label="Check-ins" height={280} /></div>
              </Section>
            </>
          ) : <Skeleton className="h-96 rounded-xl" />)}

          {tab === "expiring" && (
            <Section
              title="Expiring memberships"
              description="Renewed memberships are excluded — these people still need a call."
              actions={
                <>
                  <Segmented className="w-64" value={days} onChange={setDays} options={["3", "7", "14", "30"].map((d) => ({ value: d, label: `${d}d` }))} />
                  <Button color="secondary" iconLeading={Download01} onClick={() => csv(`/reports/expiring?days=${days}&format=csv`, "expiring.csv")}>CSV</Button>
                </>
              }
            >
              {!exp.data ? <TableSkeleton cols={4} /> : exp.data.length === 0 ? (
                <Empty icon={Hourglass03} title="Nothing expiring" description={`No memberships end in the next ${days} days.`} />
              ) : (
                <Table aria-label="Expiring memberships">
                  <Table.Header>
                    <Table.Head id="m" label="Member" isRowHeader />
                    <Table.Head id="p" label="Plan" className="max-md:hidden" />
                    <Table.Head id="e" label="Ends" />
                    <Table.Head id="d" label="Due" className="text-right [&_div]:justify-end" />
                  </Table.Header>
                  <Table.Body items={exp.data.map((e) => ({ ...e, id: e.subscription_id }))}>
                    {(e) => (
                      <Table.Row id={e.id} href={`/members/${e.member_id}`} className="cursor-pointer">
                        <Table.Cell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm" initials={initials(e.member_name)} alt={e.member_name} />
                            <div><p className="text-sm font-medium text-primary">{e.member_name}</p><p className="text-xs text-tertiary">{e.phone}</p></div>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="max-md:hidden">{e.plan_name}</Table.Cell>
                        <Table.Cell>{date(e.end_date)}</Table.Cell>
                        <Table.Cell className="text-right tabular-nums">{Number(e.balance_due) > 0 ? <span className="font-semibold text-error-primary">{money(e.balance_due, c)}</span> : "—"}</Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>
              )}
            </Section>
          )}

          {tab === "dues" && (
            <Section
              title="Outstanding dues"
              description={dues.data ? `${dues.data.length} memberships · ${money(dues.data.reduce((s, d) => s + Number(d.balance_due), 0), c)} to collect` : undefined}
              actions={<Button color="secondary" iconLeading={Download01} onClick={() => csv("/reports/dues?format=csv", "dues.csv")}>CSV</Button>}
            >
              {!dues.data ? <TableSkeleton cols={5} /> : dues.data.length === 0 ? (
                <Empty icon={Wallet02} title="All paid up" description="No outstanding balances. Nice." />
              ) : (
                <Table aria-label="Outstanding dues">
                  <Table.Header>
                    <Table.Head id="m" label="Member" isRowHeader />
                    <Table.Head id="p" label="Plan" className="max-md:hidden" />
                    <Table.Head id="paid" label="Paid" className="text-right [&_div]:justify-end max-sm:hidden" />
                    <Table.Head id="due" label="Due" className="text-right [&_div]:justify-end" />
                  </Table.Header>
                  <Table.Body items={dues.data.map((d) => ({ ...d, id: d.subscription_id }))}>
                    {(d) => (
                      <Table.Row id={d.id} href={`/members/${d.member_id}`} className="cursor-pointer">
                        <Table.Cell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm" initials={initials(d.member_name)} alt={d.member_name} />
                            <div><p className="text-sm font-medium text-primary">{d.member_name}</p><p className="text-xs text-tertiary">{d.phone}</p></div>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="max-md:hidden">
                          <p className="text-primary">{d.plan_name}</p>
                          <p className="text-xs text-tertiary">{date(d.start_date)} → {date(d.end_date)}</p>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums max-sm:hidden">{money(d.amount_paid, c)} <span className="text-tertiary">/ {money(d.price, c)}</span></Table.Cell>
                        <Table.Cell className="text-right font-semibold text-error-primary tabular-nums">{money(d.balance_due, c)}</Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>
              )}
            </Section>
          )}
        </motion.div>
      </AnimatePresence>
      <p className="mt-6 text-sm text-tertiary">Need member-level detail? Open anyone from the tables, or browse <Link className="font-semibold text-brand-secondary" href="/payments">all payments</Link>.</p>
    </>
  );
}

export default function Page() {
  return <Suspense><Reports /></Suspense>;
}
