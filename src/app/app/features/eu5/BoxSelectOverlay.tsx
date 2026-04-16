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
          ? "border-rose-300 bg-rose-500/15 shadow-[0_0_0_1px_rgba(244,63,94,0.35)]"
          : "border-sky-300 bg-sky-500/15 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]",
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
