"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout, FormError } from "@/components/app/auth-layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
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
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your gym workspace.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <FormError message={error} />
        <div className="flex flex-col gap-5">
          <Input label="Email" type="email" autoComplete="email" placeholder="you@yourgym.com" isRequired value={email} onChange={setEmail} autoFocus />
          <Input label="Password" type="password" autoComplete="current-password" placeholder="Your password" isRequired value={password} onChange={setPassword} />
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" isLoading={busy} showTextWhileLoading>
          Sign in
        </Button>
        <p className="mt-3 text-center text-sm text-tertiary">
          New gym?{" "}
          <Link href="/signup" className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            Create your workspace
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
