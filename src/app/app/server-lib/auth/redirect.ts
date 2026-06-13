/**
 * Returns `to` only when it is a safe, same-origin relative path; otherwise the
 * `fallback`. Guards against open redirects by rejecting absolute URLs and
 * protocol-relative (`//host`) or backslash (`/\host`) tricks.
 */
export function safeRedirect(to: string | null | undefined, fallback = "/"): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) {
    return fallback;
  }
  return to;
}
