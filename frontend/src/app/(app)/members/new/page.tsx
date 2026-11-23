"use client";

import { useRouter } from "next/navigation";
import { MemberForm } from "@/components/MemberForm";
import { PageHeader } from "@/components/ui";

export default function NewMember() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Register member" subtitle="Next you'll be able to sell a membership and take payment." />
      <section className="card">
        <MemberForm onSaved={(m) => router.push(`/members/${m.id}?sell=1`)} onCancel={() => router.back()} />
      </section>
    </>
  );
}
