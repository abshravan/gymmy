"use client";

import { AlertCircle } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { api, qs } from "@/lib/api";
import type { MemberDetail } from "@/lib/types";
import { ModalActions } from "./app-modal";
import { FormError } from "./auth-layout";
import { DateField } from "./date-field";
import { FieldGrid, SelectField } from "./fields";

type Dup = { id: string; member_number: string; full_name: string; phone: string };

const EMPTY = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  gender: "",
  date_of_birth: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
};
type FormState = typeof EMPTY;

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-secondary pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[240px_1fr] lg:gap-8">
      <div>
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-tertiary">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function MemberForm({ initial, onSaved, onCancel, compact }: {
  initial?: MemberDetail;
  onSaved: (m: MemberDetail) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return EMPTY;
    const f = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof FormState)[]) f[k] = (initial[k] as string | null) ?? "";
    return f;
  });
  const [status, setStatus] = useState<string>(initial?.status ?? "active");
  const [dups, setDups] = useState<Dup[]>([]);
  const [confirmDup, setConfirmDup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function checkPhone() {
    if (initial || form.phone.trim().length < 5) return;
    try {
      setDups(await api<Dup[]>(`/members/duplicates${qs({ phone: form.phone })}`));
    } catch {
      /* advisory only */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
    try {
      const m = initial
        ? await api<MemberDetail>(`/members/${initial.id}`, { method: "PATCH", body: { ...body, status } })
        : await api<MemberDetail>("/members", { body: { ...body, allow_duplicate_phone: confirmDup } });
      onSaved(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      if (!initial) checkPhone();
      setBusy(false);
    }
  }

  const blocked = dups.length > 0 && !confirmDup && !initial;

  const basics = (
    <>
      <FieldGrid>
        <Input label="First name" isRequired value={form.first_name} onChange={set("first_name")} autoFocus={!initial} />
        <Input label="Last name" value={form.last_name} onChange={set("last_name")} />
      </FieldGrid>
      <FieldGrid>
        <Input label="Phone" type="tel" isRequired minLength={5} value={form.phone} onChange={(v) => { set("phone")(v); setDups([]); setConfirmDup(false); }} onBlur={checkPhone} />
        <Input label="Email" type="email" value={form.email} onChange={set("email")} />
      </FieldGrid>
      <AnimatePresence>
        {dups.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex gap-3 rounded-xl bg-warning-primary p-4 ring-1 ring-warning_subtle ring-inset">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-fg-warning-primary" />
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-secondary">
                  <span className="font-semibold">Possible duplicate.</span>{" "}
                  {dups.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ", "}
                      <Link className="font-semibold text-brand-secondary underline" href={`/members/${d.id}`}>{d.full_name} ({d.member_number})</Link>
                    </span>
                  ))}{" "}
                  already uses this number.
                </p>
                <Checkbox label="This is a different person — register anyway" isSelected={confirmDup} onChange={setConfirmDup} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <FormError message={error} />
      <Group title="Basics" description={compact ? undefined : "Phone is used to find members quickly at the desk."}>{basics}</Group>
      <Group title="Personal" description={compact ? undefined : "Optional."}>
        <FieldGrid>
          <SelectField label="Gender" placeholder="Select" value={form.gender} onChange={set("gender")}
            options={[{ value: "Female", label: "Female" }, { value: "Male", label: "Male" }, { value: "Other", label: "Other" }]} />
          <DateField label="Date of birth" value={form.date_of_birth} onChange={set("date_of_birth")} />
        </FieldGrid>
        <Input label="Address" value={form.address} onChange={set("address")} />
      </Group>
      <Group title="Emergency contact">
        <FieldGrid>
          <Input label="Name" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
          <Input label="Phone" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
        </FieldGrid>
      </Group>
      <Group title="Notes" description={compact ? undefined : "Visible to staff. Avoid health details unless needed."}>
        <TextArea aria-label="Notes" rows={3} value={form.notes} onChange={set("notes")} />
        {initial && (
          <SelectField label="Account status" value={status} onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended", sub: "blocked from check-in" },
              { value: "inactive", label: "Inactive" },
            ]} />
        )}
      </Group>
      <ModalActions className={compact ? "" : "sm:ml-auto sm:w-max"}>
        {onCancel && <Button color="secondary" size="lg" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" size="lg" isDisabled={blocked} isLoading={busy} showTextWhileLoading>
          {initial ? "Save changes" : "Register member"}
        </Button>
      </ModalActions>
    </form>
  );
}
