import { cx } from "class-variance-authority";

/** A key hint: a filled key with no edge, because an edge means a button. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[16px] items-center justify-center rounded-plate bg-game-panel-active px-1 font-game-num text-game-small text-game-ink-300",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
