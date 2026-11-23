"use client";

import { ArrowRight, CornerDownLeft, SearchLg, UserPlus01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks";
import type { Member, Page } from "@/lib/types";
import { cx } from "@/utils/cx";
import { NAV } from "./nav";
import { StatusBadge } from "./status-badge";

const CommandContext = createContext<() => void>(() => undefined);
export const useCommandMenu = () => useContext(CommandContext);

type Item =
  | { kind: "member"; id: string; title: string; sub: string; member: Member }
  | { kind: "nav" | "action"; id: string; title: string; sub?: string; href: string; icon: React.FC<{ className?: string }> };

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandContext.Provider value={show}>
      {children}
      <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="items-start! sm:pt-[12vh]!">
        <Modal className="max-w-xl overflow-hidden">
          <Dialog aria-label="Search">
            {open && <CommandPanel onClose={() => setOpen(false)} />}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </CommandContext.Provider>
  );
}

function CommandPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState(0);
  const q = useDebounced(query, 150);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!can("members:read") || q.trim().length < 2) {
      setMembers([]);
      return;
    }
    let live = true;
    api<Page<Member>>(`/members${qs({ q, page_size: 6 })}`)
      .then((r) => live && setMembers(r.items))
      .catch(() => live && setMembers([]));
    return () => {
      live = false;
    };
  }, [q, can]);

  const items: Item[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const nav = NAV.filter((n) => can(n.perm))
      .filter((n) => !needle || `${n.label} ${n.keywords}`.toLowerCase().includes(needle))
      .map((n) => ({ kind: "nav" as const, id: n.href, title: n.label, href: n.href, icon: n.icon, sub: "Go to page" }));
    const actions = can("members:write") && (!needle || "new member register add".includes(needle))
      ? [{ kind: "action" as const, id: "new-member", title: "Register new member", href: "/members/new", icon: UserPlus01 }]
      : [];
    const people = members.map((m) => ({
      kind: "member" as const,
      id: m.id,
      title: m.full_name,
      sub: `${m.member_number} · ${m.phone}`,
      member: m,
    }));
    return [...people, ...actions, ...nav];
  }, [members, query, can]);

  useEffect(() => setActive(0), [items.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.kind === "member" ? `/members/${item.id}` : item.href);
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-secondary px-4">
        <SearchLg className="size-5 shrink-0 text-fg-quaternary" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder="Search members or jump to a page…"
          aria-label="Search members or pages"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
          className="h-14 w-full bg-transparent text-md text-primary outline-hidden placeholder:text-placeholder"
        />
        <kbd className="rounded-md px-1.5 py-0.5 text-xs font-medium text-quaternary ring-1 ring-secondary ring-inset">Esc</kbd>
      </div>
      <ul ref={listRef} id="command-list" role="listbox" className="flex-1 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {items.length === 0 && (
            <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 py-8 text-center text-sm text-tertiary">
              No results for “{query}”
            </motion.li>
          )}
          {items.map((item, i) => {
            const selected = i === active;
            return (
              <motion.li
                layout="position"
                key={item.kind + item.id}
                id={`cmd-${item.id}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
                className="relative cursor-pointer"
              >
                {selected && (
                  <motion.span
                    layoutId="cmd-active"
                    className="absolute inset-0 rounded-lg bg-primary_hover"
                    transition={{ type: "spring", stiffness: 600, damping: 45 }}
                  />
                )}
                <div className="relative flex items-center gap-3 px-3 py-2.5">
                  {item.kind === "member" ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-semibold text-brand-secondary">
                      {initials(item.title)}
                    </span>
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-secondary ring-inset">
                      <item.icon className="size-4 text-fg-quaternary" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary">{item.title}</div>
                    {item.sub && <div className="truncate text-xs text-tertiary">{item.sub}</div>}
                  </div>
                  {item.kind === "member" && <StatusBadge value={item.member.membership_status} />}
                  {selected ? (
                    <CornerDownLeft className="size-4 text-fg-quaternary" />
                  ) : (
                    <ArrowRight className={cx("size-4 text-fg-quaternary opacity-0")} />
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <div className="flex items-center gap-4 border-t border-secondary px-4 py-2.5 text-xs text-quaternary">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate</span>
        <span><Kbd>↵</Kbd> to open</span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded px-1 font-sans ring-1 ring-secondary ring-inset">{children}</kbd>;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
