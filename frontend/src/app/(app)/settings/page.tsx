"use client";

import { Building07, Plus } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/auth-layout";
import { FieldGrid, Segmented } from "@/components/app/fields";
import { PageHeader, Section } from "@/components/app/page-header";
import { Skeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Branch, Organization } from "@/lib/types";

export default function Settings() {
  const org = useApi<Organization>("/organization");
  const branches = useApi<Branch[]>("/branches");
  const [form, setForm] = useState<Partial<Organization>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branchName, setBranchName] = useState("");

  useEffect(() => { if (org.data) setForm(org.data); }, [org.data]);
  const dirty = org.data && (["name", "email", "phone", "address", "timezone", "currency", "renewal_mode"] as const).some((k) => (form[k] ?? "") !== (org.data?.[k] ?? ""));
  const set = (k: keyof Organization) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { name, email, phone, address, timezone, currency, renewal_mode } = form;
      org.setData(await api<Organization>("/organization", { method: "PATCH", body: { name, email: email || null, phone: phone || null, address: address || null, timezone, currency, renewal_mode } }));
      toast.success("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/branches", { body: { name: branchName } });
      toast.success("Branch added", { description: branchName });
      setBranchName("");
      branches.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Your gym's profile and how memberships behave." />
      <div className="flex flex-col gap-6">
        <Section title="Gym profile" description="Shown on receipts and to your staff.">
          {!org.data ? <Skeleton className="m-6 h-64" /> : (
            <form onSubmit={save} className="flex flex-col gap-5 p-4 md:p-6">
              <FormError message={error} />
              <Input label="Gym name" isRequired value={form.name ?? ""} onChange={set("name")} />
              <FieldGrid>
                <Input label="Email" type="email" value={form.email ?? ""} onChange={set("email")} />
                <Input label="Phone" type="tel" value={form.phone ?? ""} onChange={set("phone")} />
              </FieldGrid>
              <Input label="Address" value={form.address ?? ""} onChange={set("address")} />
              <FieldGrid>
                <Input label="Timezone" isRequired hint="IANA name, e.g. Asia/Kolkata" value={form.timezone ?? ""} onChange={set("timezone")} />
                <Input label="Currency" isRequired maxLength={3} hint="ISO code, e.g. INR" value={form.currency ?? ""} onChange={(v) => set("currency")(v.toUpperCase())} />
              </FieldGrid>
              <Segmented label="Renewals start" value={form.renewal_mode ?? "after_current"} onChange={set("renewal_mode")}
                options={[{ value: "after_current", label: "After current ends" }, { value: "immediate", label: "Immediately" }]} />
              <AnimatePresence>
                {dirty && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl bg-primary p-3 pl-4 shadow-lg ring-1 ring-secondary">
                    <span className="text-sm text-secondary">You have unsaved changes</span>
                    <div className="flex gap-2">
                      <Button color="secondary" onClick={() => org.data && setForm(org.data)}>Discard</Button>
                      <Button type="submit" isLoading={busy}>Save</Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          )}
        </Section>

        <Section title="Branches" description="Memberships are valid at every branch unless sold for one.">
          <ul className="divide-y divide-secondary">
            <AnimatePresence initial={false}>
              {branches.data?.map((b) => (
                <motion.li key={b.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center gap-3 px-4 py-3 md:px-6">
                  <Building07 className="size-5 text-fg-quaternary" />
                  <span className="flex-1 text-sm font-medium text-primary">{b.name}</span>
                  <StatusBadge value={b.status} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <form onSubmit={addBranch} className="flex gap-3 border-t border-secondary p-4 md:px-6">
            <Input className="flex-1" placeholder="New branch name" aria-label="New branch name" isRequired value={branchName} onChange={setBranchName} />
            <Button type="submit" color="secondary" iconLeading={Plus} isDisabled={!branchName.trim()}>Add</Button>
          </form>
        </Section>
      </div>
    </>
  );
}
