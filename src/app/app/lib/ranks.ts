const s = ["th", "st", "nd", "rd"];

// Convert 1 into "1st" ... etc.
// Adapted from https://stackoverflow.com/a/31615643/433785
export const rankDisplay = (rank: number): string => {
  const v = rank % 100;
  return rank + (s[(v - 20) % 10] || s[v] || s[0]);
};
