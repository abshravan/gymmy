"use client";

import { ArrowRight, ChevronDown, Lightbulb02, PlayCircle, RefreshCw05, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { api } from "@/lib/api";
import { type DemoRole, useAuth } from "@/lib/auth";
import type { Member, Page } from "@/lib/types";
import { cx } from "@/utils/cx";

const ROLES: { value: DemoRole; label: string; home: string; blurb: string }[] = [
  { value: "owner", label: "Owner", home: "/", blurb: "Everything, including settings, staff and reports" },
  { value: "manager", label: "Manager", home: "/", blurb: "Day-to-day operations and reports" },
  { value: "receptionist", label: "Front desk", home: "/desk", blurb: "Check-ins, sign-ups and payments" },
  { value: "trainer", label: "Trainer", home: "/members", blurb: "Read-only view of members" },
];

interface Step {
  title: string;
  detail: React.ReactNode;
  href: string;
  perm: string;
}

function useSteps(): Step[] {
  const { can } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!can("members:read")) return;
    api<Page<Member>>("/members?page_size=200").then((r) => setMembers(r.items)).catch(() => undefined);
  }, [can]);

  return useMemo(() => {
    const active = members.find((m) => m.membership_status === "active" && m.status === "active");
    const expired = members.find((m) => m.membership_status === "expired");
    const frozen = members.find((m) => m.membership_status === "frozen");
    const code = (m?: Member) => (m ? <code className="rounded bg-secondary px-1 font-semibold text-primary">{m.member_number}</code> : null);
    const steps: Step[] = [
      { title: "Check someone in", detail: <>On the front desk, type {code(active) ?? "a member number"} and press Enter.</>, href: "/desk", perm: "attendance:checkin" },
      { title: "See a refused check-in", detail: <>Try {code(expired) ?? "an expired member"} — their membership has run out.</>, href: "/desk", perm: "attendance:checkin" },
      { title: "Register a member and sell a plan", detail: "Add a new member, pick a plan and take a partial payment.", href: "/members/new", perm: "members:write" },
      { title: "Unfreeze a membership", detail: <>Open {frozen ? <Link className="font-semibold text-brand-secondary underline" href={`/members/${frozen.id}`}>{frozen.full_name}</Link> : "a frozen member"} and resume their plan.</>, href: frozen ? `/members/${frozen.id}` : "/members", perm: "subscriptions:write" },
      { title: "Chase outstanding dues", detail: "Find who owes money and collect it from their profile.", href: "/reports?tab=dues", perm: "reports:read" },
      { title: "Search anything", detail: <>Press <kbd className="rounded px-1 ring-1 ring-secondary">Ctrl/⌘ K</kbd> from any page.</>, href: "", perm: "members:read" },
    ];
    return steps.filter((s) => can(s.perm));
  }, [members, can]);
}

function DemoBarInner() {
  const { me, switchDemoRole, startDemo } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const steps = useSteps();

  useEffect(() => {
    // Open the guide on arrival, but not on phones where it would cover the page.
    if (params.get("tour") === "1" && window.matchMedia("(min-width: 768px)").matches) setOpen(true);
  }, [params]);

  if (!me?.is_demo) return null;
  const current = ROLES.find((r) => r.value === me.role) ?? ROLES[0];

  async function switchTo(role: DemoRole) {
    if (role === me?.role) return;
    setBusy(role);
    try {
      await switchDemoRole(role);
      const r = ROLES.find((x) => x.value === role)!;
      toast.success(`Now viewing as ${r.label}`, { description: r.blurb });
      router.push(r.home);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      await startDemo(me!.role as DemoRole);
      toast.success("Fresh demo gym ready", { description: "All sample data has been reset." });
      router.push(current.home);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reset");
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="no-print overflow-hidden"
    >
      <div className="relative overflow-hidden bg-brand-section text-white lg:rounded-xl">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-10 size-64 rounded-full bg-brand-solid opacity-40 blur-3xl"
          animate={{ x: [0, -60, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <PlayCircle className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">You&apos;re exploring a demo gym</p>
              <p className="truncate text-xs text-white/75">Sample data, private to you. Change anything — it resets in 24 hours.</p>
            </div>
          </div>

          <div role="radiogroup" aria-label="View the demo as" className="flex shrink-0 rounded-lg bg-white/10 p-0.5 ring-1 ring-white/15 ring-inset">
            {ROLES.map((r) => {
              const on = r.value === me.role;
              return (
                <button
                  key={r.value}
                  role="radio"
                  aria-checked={on}
                  title={r.blurb}
                  disabled={!!busy}
                  onClick={() => switchTo(r.value)}
                  className={cx(
                    "relative rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white/75 outline-white transition-colors hover:text-white focus-visible:outline-2 disabled:cursor-wait",
                    on && "text-brand-secondary hover:text-brand-secondary",
                  )}
                >
                  {on && <motion.span layoutId="demo-role" className="absolute inset-0 rounded-md bg-white shadow-xs" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <span className="relative">{busy === r.value ? "…" : r.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/90 ring-1 ring-white/20 transition hover:bg-white/10 ring-inset"
            >
              <Lightbulb02 className="size-4" /> Things to try
              <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} />
            </button>
            <button
              onClick={reset}
              disabled={!!busy}
              title="Start over with fresh sample data"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/90 ring-1 ring-white/20 transition hover:bg-white/10 ring-inset disabled:cursor-wait"
            >
              <RefreshCw05 className={cx("size-4", busy === "reset" && "animate-spin")} /> Reset
            </button>
            <Button size="sm" color="secondary" href="/signup" className="max-sm:hidden">Create your gym</Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="relative overflow-hidden"
            >
              <div className="px-4 pb-4 md:px-6">
                <div className="rounded-xl bg-primary p-2 text-primary shadow-lg">
                  <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    <p className="text-sm font-semibold">Things to try as {current.label.toLowerCase()}</p>
                    <button aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-fg-quaternary hover:bg-primary_hover">
                      <X className="size-4" />
                    </button>
                  </div>
                  <ol className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {steps.map((s, i) => (
                      <motion.li key={s.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}>
                        <button
                          onClick={() => { if (s.href) router.push(s.href); }}
                          className="group flex h-full w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-primary_hover"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-semibold text-brand-secondary">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-primary">{s.title}</span>
                            <span className="block text-sm text-tertiary">{s.detail}</span>
                          </span>
                          {s.href && <ArrowRight className="mt-0.5 size-4 shrink-0 text-fg-quaternary opacity-0 transition-opacity group-hover:opacity-100" />}
                        </button>
                      </motion.li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function DemoBar() {
  return <Suspense><DemoBarInner /></Suspense>;
}
