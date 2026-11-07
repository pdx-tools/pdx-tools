import {
  formatCount,
  formatExactAmount,
  formatExactPercent,
  formatLevel,
  formatMetric,
  formatPercent,
  formatScale,
} from "@/lib/format";
import { ExactValue } from "./ExactValue";

const FORMS = {
  metric: { text: formatMetric, exact: formatExactAmount },
  level: { text: formatLevel, exact: formatExactAmount },
  scale: { text: formatScale, exact: formatExactAmount },
  count: { text: formatCount, exact: (x: number) => formatExactAmount(x, 0) },
  percent: { text: formatPercent, exact: formatExactPercent },
};

/** A number in the form of its kind, with the full value behind it if the form hides one */
export function Figure({
  value,
  form = "metric",
  prefix = "",
  suffix = "",
}: {
  value: number;
  form?: keyof typeof FORMS;
  prefix?: string;
  suffix?: string;
}) {
  const { text, exact } = FORMS[form];
  const full = exact(value);
  return (
    <ExactValue exact={full === undefined ? undefined : `${prefix}${full}${suffix}`}>
      {prefix}
      {text(value)}
      {suffix}
    </ExactValue>
  );
}
