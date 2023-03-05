import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config.js";
import { useMediaQuery } from "./useMediaQuery";

const fullConfig = resolveConfig(tailwindConfig);
const screens = fullConfig.theme?.screens;

const breakpoints = {
  sm: screens && "sm" in screens ? screens["sm"] : "640px",
  md: screens && "md" in screens ? screens["md"] : "768px",
  lg: screens && "lg" in screens ? screens["lg"] : "1024px",
  xl: screens && "xl" in screens ? screens["xl"] : "1280x",
  "2xl": screens && "2xl" in screens ? screens["2xl"] : "1536px",
} as const;

export function useBreakpoint(breakpoint: keyof typeof breakpoints) {
  return useMediaQuery(`(min-width: ${breakpoints[breakpoint]})`);
}
