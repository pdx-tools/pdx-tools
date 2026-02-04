export function getIsDeveloper() {
  return localStorage.getItem("developer") === "1";
}

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

function isValidLogLevel(level: string | null): level is LogLevel {
  return (
    level === "error" ||
    level === "warn" ||
    level === "info" ||
    level === "debug" ||
    level === "trace"
  );
}

export function getLogLevel(): LogLevel {
  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const urlLevel = urlParams.get("logLevel")?.toLowerCase() ?? null;
  if (isValidLogLevel(urlLevel)) {
    return urlLevel;
  }

  // Check localStorage
  const storedLevel = localStorage.getItem("logLevel")?.toLowerCase() ?? null;
  if (isValidLogLevel(storedLevel)) {
    return storedLevel;
  }

  return "warn";
}
