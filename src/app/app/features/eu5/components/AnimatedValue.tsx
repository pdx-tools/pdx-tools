import { memo, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  DOM_TRANSITION_DURATION,
  DOM_TRANSITION_EASING,
  adaptiveDuration,
  prefersReducedMotion,
} from "@/components/viz/chartMotion";
import { useInheritedVisible } from "./useElementVisible";

interface LocaleSeparators {
  decimal: string;
  group: string;
}

function resolveSeparators(locale?: string): LocaleSeparators {
  // Probe with 5 integer digits so locales that only group at >= 10,000 (es-ES, pl-PL, pt-PT)
  // still emit their group separator instead of falling back to `,` (which collides with decimal).
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.5);
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const group = parts.find((p) => p.type === "group")?.value ?? "";
  return { decimal, group: group === decimal ? "" : group };
}

const defaultSeparators = resolveSeparators();

const COMPACT_SCALES: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

export interface ParsedAnimatedValue {
  text: string;
  prefix: string;
  number: string;
  suffix: string;
  decimal: string;
  actual: number;
}

/**
 * Parse a formatted EU5 numeric readout (supporting locale separators, K/M/B suffixes
 * including trailing units like `14.3K mo`, and `<0.1` / `-<0.1` thresholds) while
 * preserving the exact rendered text.
 */
export function parseAnimatedValue(value: ReactNode, locale?: string): ParsedAnimatedValue | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = String(value);
    return { text, prefix: "", number: text, suffix: "", decimal: ".", actual: value };
  }
  if (typeof value !== "string") return null;
  const text = value;
  const match = /^([^\d+\-−<]*?)([+\-−]?)(<?)(\d[\d.,\u00a0\u202f]*)([^\d]*)$/.exec(text);
  if (!match) return null;
  const [, rawPrefix = "", sign = "", lt = "", digits = "", suffix = ""] = match;
  const { decimal, group } = locale ? resolveSeparators(locale) : defaultSeparators;
  let cleanDigits = digits.replaceAll("\u00a0", "").replaceAll("\u202f", "");
  if (group) cleanDigits = cleanDigits.replaceAll(group, "");
  if (decimal !== ".") cleanDigits = cleanDigits.replace(decimal, ".");
  const signed = `${sign === "−" ? "-" : sign}${cleanDigits}`;
  const numeric = Number(signed);
  if (!Number.isFinite(numeric)) return null;
  const compactMatch = /^([KMB])(?=\s|$)/.exec(suffix);
  const scale = compactMatch ? (COMPACT_SCALES[compactMatch[1]!] ?? 1) : 1;
  // Treat `<0.1` / `-<0.1` as half their bound so `0 < <0.1 < 0.1` and `-0.1 < -<0.1 < 0`.
  const actual = numeric * scale * (lt ? 0.5 : 1);
  return {
    text,
    prefix: lt ? `${rawPrefix}${sign}${lt}` : rawPrefix,
    number: lt ? digits : `${sign}${digits}`,
    suffix,
    decimal,
    actual,
  };
}

/** Retain the original formatting, animating changed digits with compositor transforms. */
export const AnimatedValue = memo(function AnimatedValue({ value }: { value: ReactNode }) {
  const parsed = parseAnimatedValue(value);
  if (!parsed) return <>{value}</>;
  return <RollingNumber {...parsed} />;
});

interface SharedTiming {
  actual: number;
  lastUpdateAt: number | null;
  duration: number;
}

function RollingNumber({ text, prefix, number, suffix, decimal, actual }: ParsedAnimatedValue) {
  const { ref, visible } = useInheritedVisible<HTMLSpanElement>();
  const reduced = prefersReducedMotion();
  // Shared per-number timing so every digit in the same update animates in lockstep.
  const timingRef = useRef<SharedTiming>({
    actual,
    lastUpdateAt: null,
    duration: DOM_TRANSITION_DURATION,
  });

  if (!visible || reduced) {
    return (
      <span ref={ref} className="whitespace-nowrap tabular-nums">
        {text}
      </span>
    );
  }

  const getSyncDuration = (nextActual: number): number => {
    const state = timingRef.current;
    if (state.actual !== nextActual) {
      const now = performance.now();
      state.duration = adaptiveDuration(state.lastUpdateAt, now, DOM_TRANSITION_DURATION);
      state.lastUpdateAt = now;
      state.actual = nextActual;
    }
    return state.duration;
  };

  // Keys follow decimal places so grouping and changes in magnitude do not shift digit identity.
  const [integer = "", fraction] = number.split(decimal);
  const intChars = [...integer];
  let place = 0;
  for (const ch of intChars) {
    if (ch >= "0" && ch <= "9") place++;
  }

  const parts: Array<{ key: string; char: string; rolling: boolean }> = [];
  for (let i = 0; i < intChars.length; i++) {
    const char = intChars[i]!;
    if (char >= "0" && char <= "9") {
      parts.push({ key: `integer-${--place}`, char, rolling: true });
    } else if (i === 0 && (char === "+" || char === "-" || char === "−")) {
      parts.push({ key: "sign", char, rolling: true });
    } else {
      parts.push({ key: `sep-${place}-${char}`, char, rolling: false });
    }
  }
  if (fraction !== undefined) {
    parts.push({ key: "decimal", char: decimal, rolling: false });
    let fracIdx = 0;
    for (const char of fraction) {
      parts.push({
        key: `fraction-${fracIdx++}`,
        char,
        rolling: char >= "0" && char <= "9",
      });
    }
  }

  return (
    <span ref={ref} className="whitespace-nowrap tabular-nums">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {prefix}
        {parts.map(({ key, char, rolling }) =>
          rolling ? (
            <RollingCharacter key={key} char={char} actual={actual} getDuration={getSyncDuration} />
          ) : (
            <span key={key}>{char}</span>
          ),
        )}
        {suffix}
      </span>
    </span>
  );
}

function RollingCharacter({
  char,
  actual,
  getDuration,
}: {
  char: string;
  actual: number;
  getDuration: (nextActual: number) => number;
}) {
  const incoming = useRef<HTMLSpanElement>(null);
  const outgoing = useRef<HTMLSpanElement>(null);
  const previous = useRef({ char, actual });

  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { char, actual };
    const next = incoming.current;
    const last = outgoing.current;
    if (!next || !last || old.char === char || prefersReducedMotion()) return;

    const duration = getDuration(actual);
    last.textContent = old.char;
    const trend = Math.sign(actual - old.actual);
    const direction = trend < 0 ? -1 : 1;
    const digit = /\d/.test(old.char) && /\d/.test(char);
    const timing = digit
      ? { duration, easing: DOM_TRANSITION_EASING }
      : { duration: Math.min(250, duration), easing: "ease-out" };
    const enter = next.animate(
      digit
        ? [{ transform: `translateY(${direction * 100}%)` }, { transform: "translateY(0)" }]
        : [{ opacity: 0 }, { opacity: 1 }],
      timing,
    );
    const exit = last.animate(
      digit
        ? [
            { transform: "translateY(0)", opacity: 1 },
            { transform: `translateY(${-direction * 100}%)`, opacity: 1 },
          ]
        : [{ opacity: 1 }, { opacity: 0 }],
      timing,
    );
    return () => {
      enter.cancel();
      exit.cancel();
    };
  }, [char, actual, getDuration]);

  return (
    <span className="relative inline-block overflow-clip align-bottom">
      <span className="invisible select-none">{char}</span>
      <span ref={incoming} className="absolute inset-0">
        {char}
      </span>
      <span ref={outgoing} className="absolute inset-0 opacity-0 select-none" />
    </span>
  );
}
