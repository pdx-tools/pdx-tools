export function getEnv(setting: string) {
  const result = process.env[setting];
  if (result === undefined) {
    throw new Error(`setting detected as undefined: ${setting}`);
  } else {
    return result;
  }
}
