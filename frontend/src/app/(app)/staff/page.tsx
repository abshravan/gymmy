"use client";

import { Key01, Plus, Users03 } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { AppModal, ModalActions } from "@/components/app/app-modal";
import { FormError } from "@/components/app/auth-layout";
import { initials } from "@/components/app/command-menu";
import { useConfirm } from "@/components/app/confirm";
import { SelectField } from "@/components/app/fields";
import { PageHeader, Section } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Table } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Staff } from "@/lib/types";

const ROLES = [
  { value: "receptionist", label: "Receptionist", sub: "Front desk work" },
  { value: "trainer", label: "Trainer", sub: "Read-only" },
  { value: "manager", label: "Manager", sub: "All but settings & staff" },
  { value: "owner", label: "Owner", sub: "Full access" },
];

export default function StaffPage() {
  const { can, me } = useAuth();
  const confirm = useConfirm();
  const manage = can("staff:manage");
  const { data, reload } = useApi<Staff[]>("/staff");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "receptionist" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<Staff & { temporary_password: string }>("/staff", { body: { ...form, phone: form.phone || null } });
      setOpen(false);
      setForm({ name: "", email: "", phone: "", role: "receptionist" });
      setSecret({ email: r.email, password: r.temporary_password });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function update(s: Staff, body: Partial<Staff>, message: string) {
    try {
      await api(`/staff/${s.id}`, { method: "PATCH", body });
      toast.success(message, { description: s.name });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function reset(s: Staff) {
    if (!(await confirm({ title: `Reset ${s.name}'s password?`, description: "They'll be signed out everywhere and need the new temporary password.", confirmLabel: "Reset password", destructive: true }))) return;
    const r = await api<{ temporary_password: string }>(`/staff/${s.id}/reset-password`, { body: {} });
    setSecret({ email: s.email, password: r.temporary_password });
  }

  return (
    <>
      <PageHeader title="Staff" description="Who can sign in, and what they can do." actions={manage && <Button iconLeading={Plus} onClick={() => setOpen(true)}>Add staff</Button>} />
      <Section>
        {!data ? <TableSkeleton cols={4} /> : (
          <Table aria-label="Staff">
            <Table.Header>
              <Table.Head id="n" label="Name" isRowHeader />
              <Table.Head id="r" label="Role" />
              <Table.Head id="s" label="Status" className="max-md:hidden" />
              <Table.Head id="a" label="Added" className="max-lg:hidden" />
              <Table.Head id="x" label="" />
            </Table.Header>
            <Table.Body items={data}>
              {(s) => {
                const self = s.id === me?.id;
                return (
                  <Table.Row id={s.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <Avatar size="md" initials={initials(s.name)} alt={s.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-primary">{s.name}{self && <span className="text-tertiary"> (you)</span>}</p>
                          <p className="truncate text-sm text-tertiary">{s.email}</p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {manage && !self ? (
                        <SelectField size="sm" className="w-44" placeholder="Role" value={s.role} options={ROLES.map(({ value, label }) => ({ value, label }))}
                          onChange={(v) => v && v !== s.role && update(s, { role: v }, `Role changed to ${v}`)} />
                      ) : <span className="capitalize">{s.role}</span>}
                    </Table.Cell>
                    <Table.Cell className="max-md:hidden">
                      {manage && !self ? (
                        <Toggle aria-label="Active" label={s.status === "active" ? "Active" : "Disabled"} isSelected={s.status === "active"}
                          onChange={(on) => update(s, { status: on ? "active" : "disabled" }, on ? "Access restored" : "Access disabled")} />
                      ) : <StatusBadge value={s.status} />}
                    </Table.Cell>
                    <Table.Cell className="max-lg:hidden">{date(s.created_at)}</Table.Cell>
                    <Table.Cell className="text-right">
                      {manage && !self && <ButtonUtility size="xs" color="tertiary" icon={Key01} tooltip="Reset password" onClick={() => reset(s)} />}
                    </Table.Cell>
                  </Table.Row>
                );
              }}
            </Table.Body>
          </Table>
        )}
      </Section>

      <AppModal open={open} onClose={() => setOpen(false)} title="Add staff member" description="We'll generate a temporary password for you to share." icon={Users03}>
        <form className="flex flex-col gap-5" onSubmit={invite}>
          <FormError message={error} />
          <Input label="Name" isRequired value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
          <Input label="Email" type="email" isRequired value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <SelectField label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v || "receptionist" })} options={ROLES} />
          <ModalActions className="mt-1">
            <Button color="secondary" size="lg" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="lg" isLoading={busy} showTextWhileLoading>Add staff</Button>
          </ModalActions>
        </form>
      </AppModal>

      <AppModal open={!!secret} onClose={() => setSecret(null)} title="Temporary password" description="Share it securely — it won't be shown again." icon={Key01} tone="success" width="max-w-md">
        {secret && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
              <p className="text-sm text-tertiary">{secret.email}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-primary select-all">{secret.password}</p>
            </div>
            <Button size="lg" onClick={async () => {
              try { await navigator.clipboard.writeText(secret.password); toast.success("Copied to clipboard"); } catch { toast.error("Couldn't copy — select the text instead"); }
            }}>Copy password</Button>
          </div>
        )}
      </AppModal>
    </>
  );
}
