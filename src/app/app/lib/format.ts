const floatFormatters = Array.from(
  { length: 4 },
  (_, n) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: n,
      maximumFractionDigits: n,
    }),
);

const intFormatter = floatFormatters[0];

export function formatInt(x: number) {
  return intFormatter.format(x);
}

export function abbreviateInt(x: number) {
  if (x < 1000) {
    return formatInt(x);
  } else if (x < 1000000) {
    return `${formatInt(x / 1000)}K`;
  } else {
    return `${formatFloat(x / 1000000, 2)}M`;
  }
}

export function formatFloat(x: number, precision?: number) {
  return floatFormatters[precision ?? 3].format(x);
}

export function sentenceCasing(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
}

export const pluralize = (noun: string, count: number, suffix = "s") =>
  `${formatInt(count)} ${noun}${count !== 1 ? suffix : ""}`;

const listFormatLong = new Intl.ListFormat(undefined, {
  style: "long",
  type: "conjunction",
});
const listFormatShort = new Intl.ListFormat(undefined, {
  style: "short",
  type: "conjunction",
});

type FormatListOptions = {
  style?: "long" | "short";
};

export function formatList(x: string[], options?: Partial<FormatListOptions>): string {
  if (x.length === 0) {
    return "(None)";
  }

  if (options?.style === "short") {
    return listFormatShort.format(x);
  } else {
    return listFormatLong.format(x);
  }
}
