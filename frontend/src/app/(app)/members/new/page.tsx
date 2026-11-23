"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MemberForm } from "@/components/app/member-form";
import { PageHeader, Section } from "@/components/app/page-header";

export default function NewMember() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Register member" description="Next you'll pick a plan and take payment." />
      <Section>
        <div className="p-4 md:p-8">
          <MemberForm
            onSaved={(m) => {
              toast.success(`${m.full_name} registered`, { description: `Member number ${m.member_number}` });
              router.push(`/members/${m.id}?sell=1`);
            }}
            onCancel={() => router.back()}
          />
        </div>
      </Section>
    </>
  );
}
