const intFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const floatFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const floatFormatter2 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatInt(x: number) {
  return intFormatter.format(x);
}

export function formatFloat(x: number, precision?: number) {
  if (precision === 2) {
    return floatFormatter2.format(x);
  } else {
    return floatFormatter.format(x);
  }
}
