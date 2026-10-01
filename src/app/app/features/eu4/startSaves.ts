/**
 * One shared save per EU4 patch, each taken at the 11 November 1444 start so
 * players can compare how the starting world changed between versions.
 * Newest patch first. Add a row when a patch ships.
 */
export const startSaves = [
  { patch: "1.37", saveId: "o0w8pdyw9otf" },
  { patch: "1.36", saveId: "2y02s2d41qa2" },
  { patch: "1.35", saveId: "9364azxkhger" },
  { patch: "1.34", saveId: "6h5y5wra5lco" },
  { patch: "1.33", saveId: "o22v44qsdhif" },
  { patch: "1.32", saveId: "wa9sqd1flyy2" },
  { patch: "1.31", saveId: "s6u655fwi12i" },
  { patch: "1.30", saveId: "zvqrv7lo87g9" },
  { patch: "1.29", saveId: "10loz22jqw1l" },
] as const;

export type StartSave = (typeof startSaves)[number];
