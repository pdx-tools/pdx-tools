/** Shared colours and wording for save bookmarks and their legend. */
export const saveAnalysisPresentation = {
  ready: {
    label: "Analyzed",
    description: "Analysis ready",
    dotClass: "bg-emerald-400",
    bookmarkClass: "fill-emerald-400 stroke-emerald-300",
  },
  analyzing: {
    label: "Analyzing",
    description: "Analyzing save",
    dotClass: "bg-amber-400",
    bookmarkClass: "fill-amber-400 stroke-amber-300",
  },
  failed: {
    label: "Failed",
    description: "Analysis failed",
    dotClass: "bg-red-400",
    bookmarkClass: "fill-red-400 stroke-red-300",
  },
  pending: {
    label: "Waiting",
    description: "Waiting for analysis",
    dotClass: "bg-game-ink-700",
    bookmarkClass: "fill-game-ink-700 stroke-game-ink-500 group-hover:stroke-game-ink-100",
  },
} as const;

export type SaveAnalysisStatus = keyof typeof saveAnalysisPresentation;
