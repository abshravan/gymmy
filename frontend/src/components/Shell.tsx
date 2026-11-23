"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", perm: "dashboard:read" },
  { href: "/desk", label: "Front desk", perm: "attendance:checkin" },
  { href: "/members", label: "Members", perm: "members:read" },
  { href: "/plans", label: "Plans", perm: "plans:read" },
  { href: "/payments", label: "Payments", perm: "payments:read" },
  { href: "/attendance", label: "Attendance", perm: "attendance:read" },
  { href: "/reports", label: "Reports", perm: "reports:read" },
  { href: "/staff", label: "Staff", perm: "staff:read" },
  { href: "/settings", label: "Settings", perm: "org:manage" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, can } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading || !me) return <div className="empty">Loading…</div>;
  if (!me.organization_id) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card stack">
          <h1>Platform admin</h1>
          <p className="muted">
            This account manages gyms on the platform. Use the API&apos;s /platform endpoints; a
            platform console is planned for a later milestone.
          </p>
          <button className="btn ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Gymmy</div>
        <div className="brand-sub muted">{me.organization_name}</div>
        <nav className="nav">
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="user">
          <div><strong>{me.name}</strong></div>
          <div className="muted" style={{ textTransform: "capitalize" }}>{me.role}</div>
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => logout().then(() => router.replace("/login"))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
