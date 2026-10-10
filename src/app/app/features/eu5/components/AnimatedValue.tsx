import { memo, useState } from "react";
import type { ReactNode } from "react";
import NumberFlow from "@number-flow/react";
import { useElementVisible } from "./useElementVisible";

const locale = new Intl.NumberFormat().resolvedOptions().locale;
const separators = new Intl.NumberFormat(locale).formatToParts(1234.5);
const decimal = separators.find((p) => p.type === "decimal")?.value ?? ".";
const group = separators.find((p) => p.type === "group")?.value ?? ",";
const timing = { duration: 800, easing: "cubic-bezier(.22,.61,.36,1)" };

/** Animate a formatted numeric readout, retaining its precision and adornments. */
export const AnimatedValue = memo(function AnimatedValue({ value }: { value: ReactNode }) {
  if (typeof value !== "string" && typeof value !== "number") return <>{value}</>;
  const text = String(value);
  const match = /^([^\d+\-−]*)([+\-−]?\d[\d.,\u00a0\u202f]*)([^\d]*)$/.exec(text);
  if (!match) return <>{value}</>;
  const [, prefix, number, suffix] = match;
  const clean = number
    .replaceAll(group, "")
    .replaceAll("\u00a0", "")
    .replaceAll("\u202f", "")
    .replace(decimal, ".")
    .replace("−", "-");
  const numeric = Number(clean);
  if (!Number.isFinite(numeric)) return <>{value}</>;
  const precision = Math.min(10, number.includes(decimal) ? number.split(decimal)[1].length : 0);
  const compact = suffix === "K" || suffix === "M";
  const scaled = numeric * (suffix === "K" ? 1000 : suffix === "M" ? 1_000_000 : 1);
  return (
    <RollingNumber
      fallback={value}
      numeric={numeric}
      actual={compact ? scaled : numeric}
      precision={precision}
      prefix={prefix}
      suffix={suffix}
      grouped={number.includes(group)}
      positiveSign={number.startsWith("+")}
    />
  );
});

function RollingNumber({
  fallback,
  numeric,
  actual,
  precision,
  prefix,
  suffix,
  grouped,
  positiveSign,
}: {
  fallback: ReactNode;
  numeric: number;
  actual: number;
  precision: number;
  prefix: string;
  suffix: string;
  grouped: boolean;
  positiveSign: boolean;
}) {
  const { ref, visible } = useElementVisible();
  const [previous, setPrevious] = useState({ actual, trend: 0 });
  const trend = actual === previous.actual ? previous.trend : Math.sign(actual - previous.actual);
  if (actual !== previous.actual) setPrevious({ actual, trend });
  return (
    <span ref={ref}>
      {visible ? (
        <NumberFlow
          value={numeric}
          locales={locale}
          prefix={prefix || undefined}
          suffix={suffix || undefined}
          format={{
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
            useGrouping: grouped,
            ...(positiveSign ? { signDisplay: "always" } : {}),
          }}
          trend={trend}
          transformTiming={timing}
          spinTiming={timing}
          opacityTiming={{ duration: 250, easing: "ease-out" }}
          willChange={false}
          respectMotionPreference
          className="tabular-nums"
          style={
            {
              "--number-flow-mask-height": "0.08em",
              "--number-flow-mask-width": "0.1em",
            } as React.CSSProperties
          }
        />
      ) : (
        fallback
      )}
    </span>
  );
}
