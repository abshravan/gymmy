"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div>
          <h1>Sign in to Gymmy</h1>
          <p className="muted">Gym staff and owners</p>
        </div>
        <Alert>{error}</Alert>
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted">New gym? <Link href="/signup">Create your gym workspace</Link></p>
      </form>
    </div>
  );
}
