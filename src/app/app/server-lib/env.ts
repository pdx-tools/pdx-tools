export function isProduction() {
  return !!import.meta.env?.PROD;
}
