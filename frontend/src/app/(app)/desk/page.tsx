"use client";

import { ArrowRight, QrCode01, SearchLg, ShieldTick, UserPlus01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { initials } from "@/components/app/command-menu";
import { Empty } from "@/components/app/empty";
import { PageHeader, Section } from "@/components/app/page-header";
import { Skeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, todayISO } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { AttendanceRecord, CheckInResult, Member, Page } from "@/lib/types";
import { cx } from "@/utils/cx";

/** Work out what was typed or scanned. */
function identify(raw: string): Record<string, string> {
  const v = raw.trim();
  if (/^m\d+$/i.test(v)) return { member_number: v.toUpperCase() };
  if (/^\+?[\d\s-]{6,}$/.test(v)) return { phone: v };
  return { qr_token: v };
}

function DrawnIcon({ ok }: { ok: boolean }) {
  return (
    <motion.svg viewBox="0 0 52 52" className="size-14 shrink-0" initial="hidden" animate="shown">
      <motion.circle
        cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, shown: { pathLength: 1, opacity: 1 } }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      <motion.path
        d={ok ? "M15 27l7 7 15-16" : "M18 18l16 16M34 18L18 34"}
        fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1 } }}
        transition={{ duration: 0.35, delay: 0.3, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

export default function FrontDesk() {
  const { can, me } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<(CheckInResult & { key: number }) | null>(null);
  const [lastBody, setLastBody] = useState<Record<string, string> | null>(null);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const inputRef = useRef<HTMLInputElement>(null);
  const found = useApi<Page<Member>>(q.trim().length >= 2 ? `/members${qs({ q, page_size: 6 })}` : null);
  const today = todayISO();
  const todays = useApi<Page<AttendanceRecord>>(`/attendance${qs({ date_from: today, date_to: today, page_size: 12 })}`);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Successful check-ins clear themselves so the desk is ready for the next person.
  useEffect(() => {
    if (!result?.allowed) return;
    const id = setTimeout(() => setResult(null), 8000);
    return () => clearTimeout(id);
  }, [result]);

  async function checkIn(body: Record<string, string>) {
    setBusy(true);
    setOverride("");
    try {
      const r = await api<CheckInResult>("/attendance/check-in", { body });
      setResult({ ...r, key: Date.now() });
      setLastBody(body);
      if (r.allowed) todays.reload();
    } catch (e) {
      toast.error("Check-in failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
      setCode("");
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <PageHeader title="Front desk" description="Scan a QR pass, or type a member number or phone number." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-4">
          <Section>
            <form
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end md:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) checkIn(identify(code));
              }}
            >
              <Input
                ref={inputRef}
                className="flex-1"
                size="lg"
                label="Check in"
                icon={QrCode01}
                placeholder="Scan QR, M00012 or 98765 43210"
                shortcut="/"
                value={code}
                onChange={setCode}
                autoComplete="off"
              />
              <Button type="submit" size="lg" isLoading={busy} isDisabled={!code.trim()} iconTrailing={ArrowRight}>
                Check in
              </Button>
            </form>
          </Section>

          <AnimatePresence mode="popLayout">
            {result && (
              <motion.div
                key={result.key}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={result.allowed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1, x: [0, -8, 7, -4, 2, 0] }}
                exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.18 } }}
                // Springs only take two keyframes, so the refusal shake runs as a timed tween.
                transition={{ type: "spring", stiffness: 380, damping: 26, x: { type: "tween", duration: 0.45, ease: "easeOut" } }}
                className={cx(
                  "relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset md:p-6",
                  result.allowed ? "bg-success-primary text-fg-success-primary ring-success_subtle" : "bg-error-primary text-fg-error-primary ring-error_subtle",
                )}
                role="status"
                aria-live="assertive"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <DrawnIcon ok={result.allowed} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
                      {result.allowed ? (result.code === "duplicate" ? "Already in" : "Welcome") : "Not allowed"}
                    </p>
                    <p className="truncate text-display-xs font-semibold text-primary">{result.member.full_name}</p>
                    <p className="text-md text-secondary">{result.message}</p>
                    <p className="mt-1 text-sm text-tertiary">
                      {result.member.member_number}
                      {result.member.membership_end_date && ` · valid until ${date(result.member.membership_end_date)}`}
                    </p>
                  </div>
                  <Button color="secondary" href={`/members/${result.member.id}`}>Open profile</Button>
                </div>

                {!result.allowed && can("attendance:override") && lastBody && (
                  <form
                    className="mt-5 flex flex-col gap-3 border-t border-error_subtle pt-5 sm:flex-row sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      checkIn({ ...lastBody, override_reason: override });
                    }}
                  >
                    <Input className="flex-1" label="Let them in anyway" placeholder="Reason, e.g. renewing at the counter" isRequired minLength={3} value={override} onChange={setOverride} />
                    <Button type="submit" color="primary-destructive" iconLeading={ShieldTick} isLoading={busy}>Override</Button>
                  </form>
                )}

                {result.allowed && (
                  <motion.div
                    className="absolute inset-x-0 bottom-0 h-1 origin-left bg-fg-success-secondary/40"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: 8, ease: "linear" }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <Section title="Today's check-ins" description={todays.data ? `${todays.data.total} so far` : undefined}
            actions={<Button color="link-color" size="sm" href="/attendance">All attendance</Button>}>
            {!todays.data ? (
              <div className="flex flex-col gap-4 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : todays.data.items.length === 0 ? (
              <Empty title="No check-ins yet today" description="They'll appear here the moment someone checks in." />
            ) : (
              <ul className="divide-y divide-secondary">
                <AnimatePresence initial={false}>
                  {todays.data.items.map((a) => (
                    <motion.li
                      key={a.id}
                      layout
                      initial={{ opacity: 0, height: 0, backgroundColor: "var(--color-bg-success-primary)" }}
                      animate={{ opacity: 1, height: "auto", backgroundColor: "rgba(0,0,0,0)" }}
                      transition={{ backgroundColor: { duration: 1.6 }, default: { type: "spring", stiffness: 400, damping: 34 } }}
                    >
                      <Link href={`/members/${a.member_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary_hover md:px-6">
                        <Avatar size="sm" initials={initials(a.member_name)} alt={a.member_name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary">{a.member_name}</p>
                          <p className="text-xs text-tertiary">{a.member_number} · {a.method.replace("_", " ")}</p>
                        </div>
                        {a.override_reason && <StatusBadge value="override" />}
                        <span className="text-sm text-tertiary tabular-nums">{dateTime(a.check_in_at, me?.timezone).split(", ").pop()}</span>
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Section>
        </div>

        <Section title="Find a member" description="Search by name, phone or member number">
          <div className="p-4 md:p-6">
            <Input icon={SearchLg} placeholder="Start typing…" value={search} onChange={setSearch} aria-label="Find a member" />
          </div>
          {q.trim().length < 2 ? (
            <Empty icon={SearchLg} title="Look someone up" description="Check them in from here if they forgot their pass." />
          ) : !found.data ? (
            <div className="flex flex-col gap-4 px-6 pb-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : found.data.items.length === 0 ? (
            <Empty title="No match" description={`Nobody found for “${q}”.`}>
              {can("members:write") && <Button iconLeading={UserPlus01} href="/members/new">Register new member</Button>}
            </Empty>
          ) : (
            <ul className="stagger divide-y divide-secondary border-t border-secondary">
              {found.data.items.map((m, i) => (
                <li key={m.id} style={{ "--i": i } as React.CSSProperties} className="flex items-center gap-3 px-4 py-3 md:px-6">
                  <Avatar size="md" initials={initials(m.full_name)} alt={m.full_name} />
                  <Link href={`/members/${m.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary hover:underline">{m.full_name}</p>
                    <p className="truncate text-sm text-tertiary">{m.member_number} · {m.phone}</p>
                  </Link>
                  <StatusBadge value={m.membership_status} />
                  <Button size="sm" color="secondary" onClick={() => checkIn({ member_id: m.id })} isDisabled={busy}>Check in</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
