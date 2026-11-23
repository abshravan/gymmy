export function money(value: string | number, currency = "INR"): string {
  const n = typeof value === "string" ? Number(value) : value;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function date(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
  });
}

export function duration(value: number, unit: string): string {
  const u = value === 1 ? unit.replace(/s$/, "") : unit;
  return `${value} ${u}`;
}

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
