import { cx } from "class-variance-authority";

/** A key of the keyboard, as a small key cap. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[16px] items-center justify-center rounded-plate border border-game-line-strong bg-game-panel-2 px-1 font-game-num text-[10px] text-game-ink-500",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
