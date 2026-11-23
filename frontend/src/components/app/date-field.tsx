"use client";

import { parseDate } from "@internationalized/date";
import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";

function parse(v: string | null | undefined) {
  if (!v) return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

/** Labelled Untitled UI date picker that works with ISO `YYYY-MM-DD` strings. */
export function DateField({ label, value, onChange, hint, isRequired }: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  hint?: string;
  isRequired?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label isRequired={isRequired}>{label}</Label>
      <div className="[&_button]:w-full [&_button]:justify-start">
        <DatePicker aria-label={label} size="md" value={parse(value)} onChange={(d) => onChange(d ? d.toString() : "")} />
      </div>
      {hint && <HintText>{hint}</HintText>}
    </div>
  );
}

export function DateRangeField({ from, to, onChange }: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const start = parse(from);
  const end = parse(to);
  return (
    <DateRangePicker
      aria-label="Date range"
      size="md"
      value={start && end ? { start, end } : null}
      onChange={(r) => r && onChange(r.start.toString(), r.end.toString())}
    />
  );
}
