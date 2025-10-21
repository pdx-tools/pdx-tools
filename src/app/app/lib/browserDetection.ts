/**
 * Detects if the current browser is Chrome or Chromium-based.
 * This includes Chrome, Edge, Opera, Brave, Vivaldi, and other Chromium browsers.
 *
 * We unfortunately do this as webgpu is "supported" in firefox, but not that good.
 */
export function isChromiumBased(): boolean {
  // Check if running in a browser environment
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for Chromium-based browsers
  // Chrome/Chromium browsers have "chrome" in their user agent
  // Edge (Chromium) has "edg" (not "edge" to distinguish from legacy Edge)
  // Opera has "opr" or "opera"
  const isChrome = userAgent.includes("chrome");
  const isEdge = userAgent.includes("edg");
  const isOpera = userAgent.includes("opr") || userAgent.includes("opera");

  // Exclude non-Chromium browsers that might have "chrome" in UA for compatibility
  const isFirefox = userAgent.includes("firefox");
  const isSafari = userAgent.includes("safari") && !isChrome;

  return (isChrome || isEdge || isOpera) && !isFirefox && !isSafari;
}

/**
 * Gets a human-readable name for the current browser.
 */
export function getBrowserName(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Unknown";
  }

  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("firefox")) {
    return "Firefox";
  }
  if (userAgent.includes("edg")) {
    return "Edge";
  }
  if (userAgent.includes("opr") || userAgent.includes("opera")) {
    return "Opera";
  }
  if (userAgent.includes("chrome")) {
    return "Chrome";
  }
  if (userAgent.includes("safari")) {
    return "Safari";
  }

  return "Unknown";
}
