import type { FC } from "react";
import {
  BarChartSquare02,
  CalendarCheck01,
  CreditCard02,
  HomeLine,
  QrCode01,
  Settings01,
  Ticket01,
  Users01,
  Users03,
} from "@untitledui/icons";

export interface NavEntry {
  href: string;
  label: string;
  perm: string;
  icon: FC<{ className?: string }>;
  keywords?: string;
}

export const NAV: NavEntry[] = [
  { href: "/", label: "Dashboard", perm: "dashboard:read", icon: HomeLine, keywords: "home overview" },
  { href: "/desk", label: "Front desk", perm: "attendance:checkin", icon: QrCode01, keywords: "check in scan reception" },
  { href: "/members", label: "Members", perm: "members:read", icon: Users01, keywords: "people clients" },
  { href: "/plans", label: "Plans", perm: "plans:read", icon: Ticket01, keywords: "membership pricing" },
  { href: "/payments", label: "Payments", perm: "payments:read", icon: CreditCard02, keywords: "receipts refunds money" },
  { href: "/attendance", label: "Attendance", perm: "attendance:read", icon: CalendarCheck01, keywords: "visits check-ins" },
  { href: "/reports", label: "Reports", perm: "reports:read", icon: BarChartSquare02, keywords: "revenue dues expiring" },
  { href: "/staff", label: "Staff", perm: "staff:read", icon: Users03, keywords: "team employees roles" },
  { href: "/settings", label: "Settings", perm: "org:manage", icon: Settings01, keywords: "gym branches timezone" },
];
