import {
  formatCount,
  formatExactAmount,
  formatExactCount,
  formatExactPercent,
  formatMetric,
  formatPercent,
} from "../numberForms";
import { ExactValue } from "./ExactValue";

/** A building or RGO level: 17 stays 17, and a mean is 16.5 */
function formatLevel(x: number): string {
  return Number.isInteger(x) ? formatCount(x) : formatMetric(x);
}

const FORMS = {
  metric: { text: formatMetric, exact: formatExactAmount },
  level: { text: formatLevel, exact: formatExactAmount },
  count: { text: formatCount, exact: formatExactCount },
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
