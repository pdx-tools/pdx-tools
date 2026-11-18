import { cx } from "class-variance-authority";
import { saveAnalysisPresentation } from "./saveAnalysisPresentation";
import type { SaveAnalysisStatus } from "./saveAnalysisPresentation";

const BOOKMARK = "M1 0.5 H8 V12 L4.5 9.5 L1 12 Z";

/** Share status shapes with the legend; selection remains visible independently. */
export function SaveAnalysisGlyph({
  status,
  selected = false,
  opening = false,
}: {
  status: SaveAnalysisStatus;
  selected?: boolean;
  opening?: boolean;
}) {
  return (
    <>
      {selected && status !== "ready" && (
        <path d={BOOKMARK} strokeWidth={3} className="fill-transparent stroke-game-accent-300" />
      )}
      <path
        d={BOOKMARK}
        strokeWidth={1}
        className={cx(
          "transition-colors duration-100",
          selected && status === "ready"
            ? "fill-game-accent-300 stroke-game-accent-300"
            : saveAnalysisPresentation[status].bookmarkClass,
          opening && status !== "analyzing" && "motion-safe:animate-pulse",
        )}
      />
      {status === "failed" && (
        <path
          d="M2.5 3 L6.5 7 M6.5 3 L2.5 7"
          strokeWidth={1.5}
          className="fill-none stroke-game-err"
        />
      )}
    </>
  );
}
