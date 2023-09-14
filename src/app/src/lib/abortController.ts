export function pdxAbortController() {
  const result = new AbortController();

  // Polyfill abort controller throw if aborted
  // https://github.com/nodejs/node/pull/40951
  if (result.signal.throwIfAborted == undefined) {
    result.signal.throwIfAborted = () => {
      if (result.signal.aborted) {
        throw result.signal.reason;
      }
    };
  }

  return result;
}
