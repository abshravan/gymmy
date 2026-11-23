export type Money = string;

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  is_platform_admin: boolean;
  organization_id: string | null;
  organization_name: string | null;
  timezone: string | null;
  currency: string | null;
  permissions: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  duration_value: number;
  duration_unit: "days" | "months";
  price: Money;
  max_freeze_days: number;
  terms: string | null;
  status: "active" | "archived";
}

export type MembershipStatus = "active" | "frozen" | "upcoming" | "expired" | "cancelled" | "none";

export interface SubscriptionSummary {
  id: string;
  plan_id: string;
  plan_name: string;
  branch_id: string | null;
  start_date: string;
  end_date: string;
  price: Money;
  discount: Money;
  status: MembershipStatus;
  amount_paid: Money;
  balance_due: Money;
  payment_status: "paid" | "partial" | "unpaid";
}

export interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  status: "active" | "suspended" | "inactive";
  membership_status: MembershipStatus;
  membership_end_date: string | null;
  created_at: string;
}

export interface MemberDetail extends Member {
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  qr_token: string;
  current_subscription: SubscriptionSummary | null;
  subscriptions: SubscriptionSummary[];
  total_balance_due: Money;
}

export interface Receipt {
  id: string;
  number: string;
  amount: Money;
  issued_at: string;
}

export interface Payment {
  id: string;
  member_id: string;
  subscription_id: string | null;
  kind: "payment" | "refund";
  refund_of_id: string | null;
  amount: Money;
  method: string;
  reference: string | null;
  notes: string | null;
  status: string;
  paid_at: string;
  receipt: Receipt | null;
}

export interface AttendanceRecord {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  branch_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
  method: string;
  override_reason: string | null;
}

export interface CheckInResult {
  allowed: boolean;
  code: string;
  message: string;
  member: Member;
  attendance: AttendanceRecord | null;
}

export interface ExpiringItem {
  subscription_id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  phone: string;
  plan_name: string;
  end_date: string;
  balance_due: Money;
}

export interface DashboardSummary {
  date: string;
  currency: string;
  active_members: number;
  frozen_members: number;
  total_members: number;
  new_members_this_month: number;
  checkins_today: number;
  collections_today: Money;
  collections_this_month: Money;
  outstanding_dues: Money;
  expiring_next_7_days: number;
  expiring_soon: ExpiringItem[];
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  renewal_mode: "after_current" | "immediate";
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
}
