"use client";

import { PlayCircle } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/lib/auth";

/** One click into a private sandbox gym full of sample data. */
export function DemoButton({ className }: { className?: string }) {
  const { startDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className={className}>
      <div className="mb-5 flex items-center gap-3 text-sm text-quaternary">
        <span className="h-px flex-1 bg-border-secondary" />
        or
        <span className="h-px flex-1 bg-border-secondary" />
      </div>
      <Button
        color="secondary"
        size="lg"
        className="w-full"
        iconLeading={PlayCircle}
        isLoading={busy}
        showTextWhileLoading
        onClick={async () => {
          setBusy(true);
          try {
            await startDemo("owner");
            router.replace("/?tour=1");
          } catch (e) {
            toast.error("Couldn't start the demo", { description: e instanceof Error ? e.message : undefined });
            setBusy(false);
          }
        }}
      >
        {busy ? "Setting up your demo gym…" : "View demo"}
      </Button>
      <p className="mt-2 text-center text-xs text-tertiary">
        No sign-up. Your own private sample gym with 60+ members, payments and check-ins — explore and change anything.
      </p>
    </div>
  );
}
