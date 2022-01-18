export function translateToMeltedFilename(filename: string, extension: string) {
  const fn = filename;
  const ind = fn.lastIndexOf(".");
  if (ind == -1) {
    return `${fn}_melted.${extension}`;
  } else {
    return `${fn.substring(0, ind)}_melted.${extension}`;
  }
}
