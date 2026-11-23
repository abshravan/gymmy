"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Empty, PageHeader } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, todayISO } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { AttendanceRecord, CheckInResult, Member, Page } from "@/lib/types";

/** Work out what the receptionist typed or scanned. */
function identify(raw: string): Record<string, string> {
  const v = raw.trim();
  if (/^m\d+$/i.test(v)) return { member_number: v.toUpperCase() };
  if (/^\+?[\d\s-]{6,}$/.test(v)) return { phone: v };
  return { qr_token: v };
}

export default function FrontDesk() {
  const { can, me } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [lastBody, setLastBody] = useState<Record<string, string> | null>(null);
  const [override, setOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: found } = useApi<Page<Member>>(q.trim().length >= 2 ? `/members${qs({ q, page_size: 8 })}` : null);
  const today = todayISO();
  const { data: todays, reload } = useApi<Page<AttendanceRecord>>(`/attendance${qs({ date_from: today, date_to: today, page_size: 15 })}`);

  useEffect(() => inputRef.current?.focus(), []);

  async function checkIn(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    setResult(null);
    setOverride("");
    try {
      const r = await api<CheckInResult>("/attendance/check-in", { body });
      setResult(r);
      setLastBody(body);
      if (r.allowed) reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
      setCode("");
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <PageHeader title="Front desk" subtitle="Scan a QR pass or enter a member number / phone to check in." />
      <div className="grid two">
        <section className="card stack">
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) checkIn(identify(code)); }} className="row gap" style={{ flexWrap: "nowrap" }}>
            <input ref={inputRef} className="big" placeholder="QR code, M00012 or phone" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Member code" />
            <button className="btn" disabled={busy || !code.trim()}>Check in</button>
          </form>
          <Alert>{error}</Alert>
          {result && (
            <div className={`checkin-result ${result.allowed ? "allowed" : "denied"}`}>
              <div>
                <strong>{result.allowed ? "✓ " : "✕ "}{result.member.full_name}</strong>
                <div>{result.message}</div>
                <small>
                  {result.member.member_number}
                  {result.member.membership_end_date && ` · valid until ${date(result.member.membership_end_date)}`}
                </small>
              </div>
              <Link className="btn ghost" href={`/members/${result.member.id}`}>Open profile</Link>
            </div>
          )}
          {result && !result.allowed && can("attendance:override") && lastBody && (
            <form className="row gap" onSubmit={(e) => { e.preventDefault(); checkIn({ ...lastBody, override_reason: override }); }}>
              <input placeholder="Reason to let them in anyway" value={override} minLength={3} required onChange={(e) => setOverride(e.target.value)} style={{ flex: 1 }} />
              <button className="btn danger" disabled={busy}>Override</button>
            </form>
          )}
        </section>

        <section className="card stack">
          <h2>Find a member</h2>
          <input placeholder="Search by name, phone or member number" value={search} onChange={(e) => setSearch(e.target.value)} />
          {found && found.items.length === 0 && (
            <Empty>
              No match.{" "}
              {can("members:write") && <Link href="/members/new">Register a new member</Link>}
            </Empty>
          )}
          {found?.items.map((m) => (
            <div key={m.id} className="row spread gap" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div>
                <Link href={`/members/${m.id}`}><strong>{m.full_name}</strong></Link>{" "}
                <span className="muted">{m.member_number} · {m.phone}</span>
                <div><Badge value={m.membership_status} />{m.membership_end_date && <small className="muted"> until {date(m.membership_end_date)}</small>}</div>
              </div>
              <button className="btn small" onClick={() => checkIn({ member_id: m.id })} disabled={busy}>Check in</button>
            </div>
          ))}
        </section>
      </div>

      <section className="card flush" style={{ marginTop: "1rem" }}>
        <div className="card-head" style={{ padding: "1rem 1.25rem 0" }}>
          <h2>Today&apos;s check-ins {todays && <span className="muted">({todays.total})</span>}</h2>
          <Link href="/attendance">All attendance</Link>
        </div>
        {todays?.items.length === 0 ? <Empty>No check-ins yet today.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Member</th><th>Method</th><th></th></tr></thead>
              <tbody>
                {todays?.items.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.check_in_at, me?.timezone)}</td>
                    <td><Link href={`/members/${a.member_id}`}>{a.member_name}</Link> <span className="muted">{a.member_number}</span></td>
                    <td>{a.method.replace("_", " ")}</td>
                    <td>{a.override_reason && <Badge value="partial" label="override" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
