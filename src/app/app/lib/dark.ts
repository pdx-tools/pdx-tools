import { useMediaQuery } from "@/hooks/useMediaQuery";

export function isDarkMode() {
  return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function useIsDarkMode() {
  return useMediaQuery("(prefers-color-scheme: dark)");
}
