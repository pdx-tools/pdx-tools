import { useState } from "react";
import type { ReactNode, Ref } from "react";
import ChevronDownIcon from "@heroicons/react/24/outline/ChevronDownIcon";
import MagnifyingGlassIcon from "@heroicons/react/24/outline/MagnifyingGlassIcon";
import { cx } from "class-variance-authority";
import { Popover } from "@/components/Popover";
import { GameButton } from "@/components/game/Button";
import { focusRing } from "@/components/game/focusRing";

type RenderResults = (query: string, close: () => void) => ReactNode;

function SearchResults({
  render,
  query,
  close,
}: {
  render: RenderResults;
  query: string;
  close: () => void;
}) {
  return render(query, close);
}

export function HistorySearchPicker({
  title,
  searchLabel,
  triggerText,
  triggerLabel,
  triggerRef,
  disabled,
  children,
}: {
  title: string;
  searchLabel: string;
  triggerText: string;
  triggerLabel?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  children: RenderResults;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) setSearch("");
      }}
    >
      <Popover.Trigger asChild>
        <GameButton
          ref={triggerRef}
          disabled={disabled}
          aria-label={triggerLabel}
          className="w-full px-2.5"
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{triggerText}</span>
            <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-game-ink-500" />
          </span>
        </GameButton>
      </Popover.Trigger>
      <Popover.Content
        align="start"
        aria-label={title}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        className="flex max-h-[min(18rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) flex-col overflow-hidden rounded-panel border border-game-line-strong bg-game-panel font-game-ui shadow-lg"
      >
        <label className="flex shrink-0 items-center gap-2 border-b border-game-line px-2.5 py-2">
          <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0 text-game-ink-500" />
          <input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            className={cx(
              "w-full min-w-0 rounded-plate bg-transparent px-1 py-0.5 text-sm text-game-ink-100 placeholder:text-game-ink-500",
              focusRing,
            )}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <SearchResults
          render={children}
          query={search.trim().toLowerCase()}
          close={() => setOpen(false)}
        />
      </Popover.Content>
    </Popover>
  );
}
