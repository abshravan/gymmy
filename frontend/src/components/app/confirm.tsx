"use client";

import { AlertTriangle } from "@untitledui/icons";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { AppModal, ModalActions } from "./app-modal";

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) ...` — an accessible replacement for window.confirm. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => undefined);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AppModal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? ""}
        description={opts?.description}
        icon={AlertTriangle}
        tone={opts?.destructive ? "error" : "warning"}
        width="max-w-md"
      >
        <ModalActions className="mt-0">
          <Button color="secondary" size="lg" onClick={() => close(false)}>Cancel</Button>
          <Button color={opts?.destructive ? "primary-destructive" : "primary"} size="lg" onClick={() => close(true)}>
            {opts?.confirmLabel ?? "Confirm"}
          </Button>
        </ModalActions>
      </AppModal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
