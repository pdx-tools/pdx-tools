/**
 * Colors transcribed from EU5 for concepts without a save-provided `colorHex`.
 * Preserve game recognition rather than adapting these to the chart palette.
 */

/** Settlement rank, rural → megalopolis. An ordered set that stays game-coloured. */
export const popRankColors = {
  rural: "#b85c5c",
  town: "#8b949e",
  city: "#d6a84f",
  megalopolis: "#2aa6a1",
} as const;

/** Building ownership. Used by the chart and the foreign-share readout alike. */
export const buildingOwnershipColors = {
  domestic: "#4e9e6b",
  foreign: "#c0614a",
} as const;
