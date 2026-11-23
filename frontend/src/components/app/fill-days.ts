export interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Fill gaps so every day in [from, to] has a point. */
export function fillDays(points: Point[], from: string, to: string): Point[] {
  const map = new Map(points.map((p) => [p.date, p.value]));
  const out: Point[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) ?? 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

