// Set once a `vite:preloadError` is seen: a deploy has replaced the asset
// manifest, so chunks referenced by the currently-loaded page may 404. Read by
// `captureException` to suppress the resulting (secondary) errors that every
// React error boundary would otherwise report to Sentry once the app is known
// to be running against a stale deploy. See `lib/preloadError.ts`.
let stale = false;

export function markStaleVersion() {
  stale = true;
}

export function isStaleVersion() {
  return stale;
}
