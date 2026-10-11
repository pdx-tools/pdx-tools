import { memo, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useElementVisible } from "./useElementVisible";

const separators = new Intl.NumberFormat().formatToParts(1234.5);
const decimal = separators.find((p) => p.type === "decimal")?.value ?? ".";
const group = separators.find((p) => p.type === "group")?.value ?? ",";
const timing = { duration: 800, easing: "cubic-bezier(.22,.61,.36,1)" };

/** Retain the original formatting, animating changed digits with compositor transforms. */
export const AnimatedValue = memo(function AnimatedValue({ value }: { value: ReactNode }) {
  if (typeof value !== "string" && typeof value !== "number") return <>{value}</>;
  const text = String(value);
  const match = /^([^\d+\-−]*)([+\-−]?\d[\d.,\u00a0\u202f]*)([^\d]*)$/.exec(text);
  if (!match) return <>{value}</>;
  const [, prefix, number, suffix] = match;
  const numeric = Number(
    number
      .replaceAll(group, "")
      .replaceAll("\u00a0", "")
      .replaceAll("\u202f", "")
      .replace(decimal, ".")
      .replace("−", "-"),
  );
  if (!Number.isFinite(numeric)) return <>{value}</>;
  const actual = numeric * (suffix === "K" ? 1000 : suffix === "M" ? 1_000_000 : 1);
  return (
    <RollingNumber text={text} prefix={prefix} number={number} suffix={suffix} actual={actual} />
  );
});

function RollingNumber({
  text,
  prefix,
  number,
  suffix,
  actual,
}: {
  text: string;
  prefix: string;
  number: string;
  suffix: string;
  actual: number;
}) {
  const { ref, visible } = useElementVisible();
  const [previous, setPrevious] = useState({ actual, trend: 0 });
  const trend = actual === previous.actual ? previous.trend : Math.sign(actual - previous.actual);
  if (actual !== previous.actual) setPrevious({ actual, trend });
  // Keys follow decimal places, so grouping and changes in magnitude do not shift digit identity.
  const [integer, fraction] = number.split(decimal);
  let place = [...integer].filter((char) => /\d/.test(char)).length;
  const characters = [...integer].map((char) => ({
    key: /\d/.test(char) ? `integer-${--place}` : `separator-${place}-${char}`,
    char,
  }));
  if (fraction !== undefined) {
    characters.push({ key: "decimal", char: decimal });
    [...fraction].forEach((char, index) => characters.push({ key: `fraction-${index}`, char }));
  }
  return (
    <span ref={ref} role="img" aria-label={text} className="whitespace-nowrap tabular-nums">
      {visible ? (
        <span aria-hidden="true">
          {prefix}
          {characters.map(({ key, char }) => (
            <RollingCharacter key={key} char={char} trend={trend} />
          ))}
          {suffix}
        </span>
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </span>
  );
}

function RollingCharacter({ char, trend }: { char: string; trend: number }) {
  const incoming = useRef<HTMLSpanElement>(null);
  const outgoing = useRef<HTMLSpanElement>(null);
  const previous = useRef(char);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = char;
    const next = incoming.current;
    const last = outgoing.current;
    if (
      !next ||
      !last ||
      old === char ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    last.textContent = old;
    const direction = trend < 0 ? -1 : 1;
    const digit = /\d/.test(old) && /\d/.test(char);
    const enter = next.animate(
      digit
        ? [{ transform: `translateY(${direction * 100}%)` }, { transform: "translateY(0)" }]
        : [{ opacity: 0 }, { opacity: 1 }],
      digit ? timing : { duration: 250, easing: "ease-out" },
    );
    const exit = last.animate(
      digit
        ? [
            { transform: "translateY(0)", opacity: 1 },
            { transform: `translateY(${-direction * 100}%)`, opacity: 1 },
          ]
        : [{ opacity: 1 }, { opacity: 0 }],
      digit ? timing : { duration: 250, easing: "ease-out" },
    );
    return () => {
      enter.cancel();
      exit.cancel();
    };
  }, [char, trend]);
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
