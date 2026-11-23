"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    gym_name: "",
    owner_name: "",
    email: "",
    password: "",
    phone: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    currency: "INR",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup(form);
      router.replace("/plans");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>Create your gym</h1>
          <p className="muted">You&apos;ll be the owner. Invite your staff afterwards.</p>
        </div>
        <Alert>{error}</Alert>
        <Field label="Gym name"><input required minLength={2} value={form.gym_name} onChange={set("gym_name")} /></Field>
        <Field label="Your name"><input required value={form.owner_name} onChange={set("owner_name")} /></Field>
        <Field label="Email"><input type="email" required value={form.email} onChange={set("email")} /></Field>
        <Field label="Password" hint="At least 8 characters">
          <input type="password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <div className="form-grid">
          <Field label="Timezone"><input required value={form.timezone} onChange={set("timezone")} /></Field>
          <Field label="Currency"><input required maxLength={3} value={form.currency} onChange={set("currency")} /></Field>
        </div>
        <button className="btn" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
          {busy ? "Creating…" : "Create gym"}
        </button>
        <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
