export function createCsv<T>(data: T[], keys: (keyof T)[]): string {
  const header = keys.join(",");
  let output = header + "\n";

  for (const datum of data) {
    output += keys.map((x) => datum[x]).join(",");
    output += "\n";
  }

  return output;
}
