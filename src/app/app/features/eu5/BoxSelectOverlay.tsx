import { useEu5BoxSelectRect } from "./store";
import { cx } from "class-variance-authority";

export function BoxSelectOverlay() {
  const rect = useEu5BoxSelectRect();

  if (rect === null) {
    return null;
  }

  return (
    <div
      className={cx(
        "pointer-events-none absolute border border-solid",
        rect.operation === "remove"
          ? "border-game-err bg-game-err/15 shadow-[0_0_0_1px_rgba(196,106,90,0.35)]"
          : "border-game-accent-300 bg-game-accent-soft shadow-[0_0_0_1px_var(--color-game-accent-line)]",
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      }}
    />
  );
}
