export function getEnv(setting: string) {
  const result = import.meta.env[setting];
  if (result === undefined) {
    throw new Error(`setting detected as undefined: ${setting}`);
  } else {
    return result;
  }
}
