"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";

declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <ThemeProvider attribute="class" value={{ light: "light-mode", dark: "dark-mode" }} enableSystem disableTransitionOnChange>
      <RouterProvider navigate={router.push}>
        <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 36 }}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="bottom-right"
            gap={10}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  "flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary_alt",
                title: "text-sm font-semibold text-primary",
                description: "text-sm text-tertiary",
                icon: "mt-0.5",
                success: "[&_[data-icon]]:text-fg-success-secondary",
                error: "[&_[data-icon]]:text-fg-error-secondary",
                actionButton: "ml-auto text-sm font-semibold text-brand-secondary",
              },
            }}
          />
        </MotionConfig>
      </RouterProvider>
    </ThemeProvider>
  );
}
