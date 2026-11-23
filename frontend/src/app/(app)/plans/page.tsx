"use client";

import { Archive, Edit05, Plus, RefreshCcw01, Snowflake01, Ticket01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { AppModal, ModalActions } from "@/components/app/app-modal";
import { FormError } from "@/components/app/auth-layout";
import { Empty } from "@/components/app/empty";
import { FieldGrid, Segmented } from "@/components/app/fields";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { duration, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Plan } from "@/lib/types";
import { cx } from "@/utils/cx";

function PlanForm({ plan, onDone, onCancel }: { plan?: Plan; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    duration_value: String(plan?.duration_value ?? 1),
    duration_unit: plan?.duration_unit ?? "months",
    price: plan?.price ?? "",
    max_freeze_days: String(plan?.max_freeze_days ?? 0),
    terms: plan?.terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...f, duration_value: Number(f.duration_value), max_freeze_days: Number(f.max_freeze_days || 0), description: f.description || null, terms: f.terms || null };
    try {
      if (plan) await api(`/membership-plans/${plan.id}`, { method: "PATCH", body });
      else await api("/membership-plans", { body });
      toast.success(plan ? "Plan updated" : "Plan created", { description: f.name });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <FormError message={error} />
      <Input label="Name" placeholder="Monthly, Quarterly, Student…" isRequired value={f.name} onChange={set("name")} autoFocus />
      <FieldGrid>
        <Input label="Duration" type="number" isRequired value={f.duration_value} onChange={set("duration_value")} />
        <Segmented label="Unit" value={f.duration_unit} onChange={set("duration_unit")} options={[{ value: "months", label: "Months" }, { value: "days", label: "Days" }]} />
      </FieldGrid>
      <FieldGrid>
        <Input label="Price" type="number" inputMode="decimal" isRequired value={f.price} onChange={set("price")} />
        <Input label="Freeze allowance (days)" type="number" value={f.max_freeze_days} onChange={set("max_freeze_days")} hint="0 = no limit" />
      </FieldGrid>
      <Input label="Short description" placeholder="Optional" value={f.description} onChange={set("description")} />
      <TextArea label="Terms" rows={3} value={f.terms} onChange={set("terms")} />
      {plan && <p className="text-sm text-tertiary">Changes apply to future sales. Existing memberships keep their price and dates.</p>}
      <ModalActions className="mt-1">
        <Button color="secondary" size="lg" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="lg" isLoading={busy} showTextWhileLoading>{plan ? "Save plan" : "Create plan"}</Button>
      </ModalActions>
    </form>
  );
}

function Plans() {
  const { can, me } = useAuth();
  const params = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const { data, reload } = useApi<Plan[]>(`/membership-plans?include_archived=${showArchived}`);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const manage = can("plans:manage");
  const c = me?.currency ?? "INR";

  async function toggleArchive(p: Plan) {
    const next = p.status === "active" ? "archived" : "active";
    await api(`/membership-plans/${p.id}`, { method: "PATCH", body: { status: next } });
    toast.success(next === "archived" ? "Plan archived" : "Plan restored", { description: p.name });
    reload();
  }

  return (
    <>
      <PageHeader
        title="Membership plans"
        description="What you sell at the front desk."
        actions={
          <>
            <Toggle label="Show archived" isSelected={showArchived} onChange={setShowArchived} />
            {manage && <Button iconLeading={Plus} onClick={() => setEditing("new")}>New plan</Button>}
          </>
        }
      />
      {params.get("welcome") === "1" && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 rounded-xl bg-brand-primary_alt p-4 text-sm text-secondary ring-1 ring-brand ring-inset md:p-5">
          <p className="font-semibold text-primary">Welcome to Gymmy 👋</p>
          <p className="mt-1">Start by creating the plans you sell. Then invite your team from Staff, and register your first member.</p>
        </motion.div>
      )}
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : data.length === 0 ? (
        <div className="rounded-xl bg-primary ring-1 ring-secondary">
          <Empty size="md" icon={Ticket01} title="No plans yet" description="Create your first membership plan to start selling.">
            {manage && <Button iconLeading={Plus} onClick={() => setEditing("new")}>New plan</Button>}
          </Empty>
        </div>
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {data.map((p, i) => (
              <motion.article
                key={p.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: i * 0.035, type: "spring", stiffness: 340, damping: 30 }}
                whileHover={{ y: -3 }}
                className={cx("flex flex-col rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary transition-shadow hover:shadow-lg", p.status === "archived" && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-primary">{p.name}</h2>
                      {p.status === "archived" && <StatusBadge value="archived" />}
                    </div>
                    <p className="text-sm text-tertiary">{p.description || duration(p.duration_value, p.duration_unit)}</p>
                  </div>
                  {manage && (
                    <Dropdown.Root>
                      <Dropdown.DotsButton />
                      <Dropdown.Popover className="w-44">
                        <Dropdown.Menu onAction={(k) => (k === "edit" ? setEditing(p) : toggleArchive(p))}>
                          <Dropdown.Item id="edit" icon={Edit05} label="Edit" />
                          <Dropdown.Item id="archive" icon={p.status === "active" ? Archive : RefreshCcw01} label={p.status === "active" ? "Archive" : "Restore"} />
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown.Root>
                  )}
                </div>
                <p className="mt-6 text-display-sm font-semibold text-primary">{money(p.price, c)}</p>
                <p className="text-sm text-tertiary">per {duration(p.duration_value, p.duration_unit)}</p>
                <div className="mt-5 flex items-center gap-2 border-t border-secondary pt-4 text-sm text-tertiary">
                  <Snowflake01 className="size-4 text-fg-quaternary" />
                  {p.max_freeze_days ? `Up to ${p.max_freeze_days} freeze days` : "No freeze limit"}
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      <AppModal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New plan" : "Edit plan"} icon={Ticket01}>
        {editing && <PlanForm plan={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
      </AppModal>
    </>
  );
}

export default function Page() {
  return <Suspense><Plans /></Suspense>;
}
