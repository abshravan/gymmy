import { BadgeWithDot } from "@/components/base/badges/badges";

type Tone = "success" | "warning" | "error" | "gray" | "blue" | "brand" | "indigo";

const TONES: Record<string, Tone> = {
  active: "success",
  paid: "success",
  ok: "success",
  payment: "success",
  upcoming: "blue",
  frozen: "indigo",
  partial: "warning",
  refund: "warning",
  override: "warning",
  expired: "error",
  unpaid: "error",
  suspended: "error",
  cancelled: "gray",
  none: "gray",
  inactive: "gray",
  disabled: "gray",
  archived: "gray",
};

const LABELS: Record<string, string> = {
  none: "No membership",
  bank_transfer: "Bank transfer",
  upi: "UPI",
};

export function StatusBadge({ value, label, size = "sm" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const text = label ?? LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace("_", " ");
  return (
    <BadgeWithDot type="pill-color" color={TONES[value] ?? "gray"} size={size}>
      {text}
    </BadgeWithDot>
  );
}
