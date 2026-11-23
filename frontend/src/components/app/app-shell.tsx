"use client";

import { LogOut01, Menu02, SearchLg, X as CloseIcon } from "@untitledui/icons";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { useAuth } from "@/lib/auth";
import { cx } from "@/utils/cx";
import { CommandMenuProvider, initials, useCommandMenu } from "./command-menu";
import { ConfirmProvider } from "./confirm";
import { DemoBar } from "./demo-bar";
import { Logo } from "./logo";
import { NAV } from "./nav";
import { ThemeSwitch } from "./theme-switch";

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate, layoutGroup }: { onNavigate?: () => void; layoutGroup: string }) {
  const { me, can, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const openSearch = useCommandMenu();
  const [isMac, setIsMac] = useState(true);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  if (!me) return null;

  return (
    <div className="flex h-full flex-col bg-primary">
      <div className="flex flex-col gap-5 px-4 pt-5 lg:px-5">
        <Logo />
        <button
          onClick={() => {
            onNavigate?.();
            openSearch();
          }}
          className="group flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2 text-left shadow-xs ring-1 ring-primary outline-focus-ring transition ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <SearchLg className="size-5 text-fg-quaternary" />
          <span className="flex-1 text-md text-placeholder">Search</span>
          <kbd className="rounded px-1.5 py-0.5 font-sans text-xs font-medium text-quaternary ring-1 ring-secondary ring-inset">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
      </div>

      <nav aria-label="Main" className="mt-5 flex-1 overflow-y-auto px-4 lg:px-5">
        <ul className="flex flex-col gap-0.5">
          {NAV.filter((n) => can(n.perm)).map((n) => {
            const current = isActive(path, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  className="group relative flex items-center gap-3 rounded-md px-3 py-2 outline-focus-ring select-none focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {current && (
                    <motion.span
                      layoutId={`nav-active-${layoutGroup}`}
                      className="absolute inset-0 rounded-md bg-secondary"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  )}
                  <span className="absolute inset-0 rounded-md transition-colors duration-150 group-hover:bg-primary_hover" />
                  <n.icon
                    className={cx(
                      "relative size-5 shrink-0 text-fg-quaternary transition-colors group-hover:text-fg-quaternary_hover",
                      current && "text-fg-brand-primary",
                    )}
                  />
                  <span
                    className={cx(
                      "relative flex-1 text-md font-semibold text-secondary transition-colors group-hover:text-secondary_hover",
                      current && "text-primary",
                    )}
                  >
                    {n.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-4 px-4 py-5 lg:px-5">
        <ThemeSwitch />
        <div className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-secondary ring-inset">
          <Avatar size="md" initials={initials(me.name)} alt={me.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">{me.name}</p>
            <p className="truncate text-sm text-tertiary capitalize">{me.role} · {me.organization_name}</p>
          </div>
          <ButtonUtility
            size="xs"
            color="tertiary"
            tooltip="Sign out"
            icon={LogOut01}
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MobileHeader() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-secondary bg-primary/85 px-4 backdrop-blur-md lg:hidden">
        <Logo />
        <button
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-fg-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
        >
          <Menu02 className="size-6" />
        </button>
      </header>
      <AriaModalOverlay
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable
        className={({ isEntering, isExiting }) =>
          cx(
            "fixed inset-0 z-50 bg-overlay/70 backdrop-blur-md lg:hidden",
            isEntering && "duration-300 ease-out animate-in fade-in",
            isExiting && "duration-200 ease-in animate-out fade-out",
          )
        }
      >
        <AriaModal
          className={({ isEntering, isExiting }) =>
            cx(
              "h-dvh w-full max-w-80 shadow-xl",
              isEntering && "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] animate-in slide-in-from-left",
              isExiting && "duration-200 ease-in animate-out slide-out-to-left",
            )
          }
        >
          <AriaDialog aria-label="Navigation" className="relative h-full outline-hidden">
            <button
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute top-4 -right-12 rounded-lg p-2 text-fg-white/80 hover:bg-white/10"
            >
              <CloseIcon className="size-6" />
            </button>
            <SidebarContent layoutGroup="mobile" onNavigate={() => setOpen(false)} />
          </AriaDialog>
        </AriaModal>
      </AriaModalOverlay>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
          <Logo />
        </motion.div>
      </div>
    );
  }

  return (
    <ConfirmProvider>
      <CommandMenuProvider>
        <div className="min-h-dvh bg-secondary lg:pl-[296px]">
          <aside className="fixed inset-y-0 left-0 z-20 hidden w-[296px] border-r border-secondary lg:block">
            <SidebarContent layoutGroup="desktop" />
          </aside>
          <MobileHeader />
          <main className="min-h-dvh lg:py-2 lg:pr-2">
            <div className="lg:mb-2"><DemoBar /></div>
            <div className="min-h-[calc(100dvh-16px)] bg-primary lg:rounded-xl lg:shadow-xs lg:ring-1 lg:ring-secondary">
              <motion.div
                key={`${me.id}:${path}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 34 }}
                className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-8"
              >
                {children}
              </motion.div>
            </div>
          </main>
        </div>
      </CommandMenuProvider>
    </ConfirmProvider>
  );
}
