import React from "react";
import { cx } from "class-variance-authority";
import { Chip } from "./Chip";

const baseInputClass =
  "h-7 w-full rounded-control border border-solid border-game-line bg-game-page px-2.5 font-game-ui text-[12.5px] text-game-ink-100 placeholder:text-game-ink-500 focus:outline-none focus:ring-1 focus:ring-game-accent-line disabled:opacity-40 disabled:cursor-not-allowed";

export const GameInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function GameInput({ className, ...props }, ref) {
  return <input ref={ref} className={cx(baseInputClass, className)} {...props} />;
});

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  shortcut?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ className, shortcut, ...props }, ref) {
    return (
      <div
        className={cx(
          "relative flex h-7 items-center rounded-control border border-solid border-game-line bg-game-page",
          "focus-within:ring-1 focus-within:ring-game-accent-line",
          className,
        )}
      >
        <span className="pointer-events-none absolute left-2 font-game-ui text-[13px] text-game-ink-500 select-none">
          ⌕
        </span>
        <input
          ref={ref}
          className="h-full w-full bg-transparent pr-2 pl-7 font-game-ui text-[12.5px] text-game-ink-100 placeholder:text-game-ink-500 focus:outline-none"
          {...props}
        />
        {shortcut && (
          <span className="mr-1.5 shrink-0">
            <Chip className="font-game-num text-[10px] text-game-ink-500">{shortcut}</Chip>
          </span>
        )}
      </div>
    );
  },
);
