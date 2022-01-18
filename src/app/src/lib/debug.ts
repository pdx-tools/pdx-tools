export function debugLog(msg: string) {
  if ("production" !== process.env.NODE_ENV) {
    console.log(msg);
  }
}
