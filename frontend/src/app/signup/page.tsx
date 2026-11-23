"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout, FormError } from "@/components/app/auth-layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    gym_name: "",
    owner_name: "",
    email: "",
    password: "",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata" : "Asia/Kolkata",
    currency: "INR",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup(form);
      router.replace("/plans?welcome=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your gym" subtitle="You'll be the owner. Invite your team once you're in.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <FormError message={error} />
        <div className="flex flex-col gap-5">
          <Input label="Gym name" placeholder="Iron Temple Fitness" isRequired minLength={2} value={form.gym_name} onChange={set("gym_name")} autoFocus />
          <Input label="Your name" placeholder="Priya Sharma" isRequired value={form.owner_name} onChange={set("owner_name")} />
          <Input label="Email" type="email" placeholder="you@yourgym.com" isRequired value={form.email} onChange={set("email")} />
          <Input label="Password" type="password" isRequired minLength={8} hint="At least 8 characters." value={form.password} onChange={set("password")} />
          <div className="grid grid-cols-[1fr_96px] gap-4">
            <Input label="Timezone" isRequired value={form.timezone} onChange={set("timezone")} />
            <Input label="Currency" isRequired maxLength={3} value={form.currency} onChange={(v) => set("currency")(v.toUpperCase())} />
          </div>
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" isLoading={busy} showTextWhileLoading>
          Create gym
        </Button>
        <p className="mt-3 text-center text-sm text-tertiary">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
