export function createCsv<T>(data: T[], keys: (keyof T)[]): string {
  const header = keys.join(",");
  let output = header + "\n";

  for (let i = 0; i < data.length; i++) {
    const datum = data[i];
    output += keys.map((x) => datum[x]).join(",");
    output += "\n";
  }

  return output;
}
