import { useMediaQuery } from "./useMediaQuery";

const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280x",
  "2xl": "1536px",
} as const;

export function useBreakpoint(breakpoint: keyof typeof breakpoints) {
  return useMediaQuery(`(min-width: ${breakpoints[breakpoint]})`);
}
