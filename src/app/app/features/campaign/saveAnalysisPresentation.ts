/** Shared colours and wording for save bookmarks and their legend. */
export const saveAnalysisPresentation = {
  ready: {
    label: "Analyzed",
    description: "Analysis ready",
    bookmarkClass: "fill-game-ink-300 stroke-game-ink-300",
  },
  analyzing: {
    label: "Analyzing",
    description: "Analyzing save",
    bookmarkClass: "fill-transparent stroke-game-ink-500 motion-safe:animate-pulse",
  },
  failed: {
    label: "Failed",
    description: "Analysis failed",
    bookmarkClass: "fill-transparent stroke-game-err",
  },
  pending: {
    label: "Waiting",
    description: "Waiting for analysis",
    bookmarkClass: "fill-transparent stroke-game-ink-500 group-hover:stroke-game-ink-100",
  },
} as const;

export type SaveAnalysisStatus = keyof typeof saveAnalysisPresentation;
