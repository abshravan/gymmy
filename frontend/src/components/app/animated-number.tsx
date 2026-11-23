"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Counts up to `value` when it scrolls into view, and tweens on later changes. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString("en-IN") }: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, format]);

  return <span ref={ref} className="tabular-nums">{display}</span>;
}
