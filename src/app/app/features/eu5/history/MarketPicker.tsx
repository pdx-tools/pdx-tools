import { useRef, useState } from "react";
import ChevronDownIcon from "@heroicons/react/24/outline/ChevronDownIcon";
import MagnifyingGlassIcon from "@heroicons/react/24/outline/MagnifyingGlassIcon";
import XMarkIcon from "@heroicons/react/24/outline/XMarkIcon";
import { cx } from "class-variance-authority";
import { Popover } from "@/components/Popover";
import { GameButton } from "@/components/game/Button";
import { focusRing } from "@/components/game/focusRing";
import type { AnalyticsCatalog } from "@/wasm/wasm_eu5";

type Market = AnalyticsCatalog["marketLabels"][number];
const marketLimit = 6;

export function MarketPicker({
  choices,
  selected,
  onChange,
}: {
  choices: Market[];
  selected: Market[];
  onChange: (centers: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedCenters = selected.map(({ center }) => center);
  const atLimit = selected.length >= marketLimit;
  const term = search.trim().toLowerCase();
  const matches = choices.filter(({ name }) => name.toLowerCase().includes(term));
  const remove = (center: number) => onChange(selectedCenters.filter((id) => id !== center));

  if (choices.length === 1) {
    return (
      <div className="col-span-2 space-y-1 text-xs text-game-ink-300">
        <div>Market</div>
        <div className="rounded-control border border-game-control-line bg-game-page px-2.5 py-1.5 text-game-ink-100">
          {choices[0].name}
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-2 space-y-1 text-xs text-game-ink-300">
      <div className="flex justify-between gap-2">
        <span>Markets</span>
        <span className="text-game-ink-500" aria-live="polite">
          {selected.length} of {marketLimit} selected
        </span>
      </div>
      <Popover
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (open) setSearch("");
        }}
      >
        <Popover.Trigger asChild>
          <GameButton ref={trigger} disabled={!choices.length} className="w-full px-2.5">
            <span className="flex w-full items-center justify-between">
              {selected.length ? "Edit markets" : "Select markets"}
              <ChevronDownIcon aria-hidden="true" className="size-3.5 text-game-ink-500" />
            </span>
          </GameButton>
        </Popover.Trigger>
        <Popover.Content
          align="start"
          aria-label="Select markets"
          className="flex max-h-[min(18rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) flex-col overflow-hidden rounded-panel border border-game-line-strong bg-game-panel font-game-ui shadow-lg"
        >
          <label className="flex shrink-0 items-center gap-2 border-b border-game-line px-2.5 py-2">
            <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0 text-game-ink-500" />
            <input
              type="search"
              aria-label="Search markets"
              placeholder="Search markets"
              className={cx(
                "w-full min-w-0 rounded-plate bg-transparent px-1 py-0.5 text-sm text-game-ink-100 placeholder:text-game-ink-500",
                focusRing,
              )}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div role="group" aria-label="Markets" className="min-h-0 overflow-y-auto p-1">
            {matches.map(({ center, name }) => {
              const checked = selectedCenters.includes(center);
              return (
                <label
                  key={center}
                  className="flex cursor-pointer items-center gap-2 rounded-plate px-2 py-1.5 text-xs text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 has-disabled:cursor-not-allowed has-disabled:opacity-40"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    className="shrink-0 accent-game-accent-300"
                    onChange={() =>
                      checked ? remove(center) : onChange([...selectedCenters, center])
                    }
                  />
                  {name}
                </label>
              );
            })}
            {!matches.length && (
              <p className="p-2 text-xs text-game-ink-500">No markets match your search.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-game-line px-2 py-1.5">
            {atLimit && (
              <p className="text-xs text-game-ink-500">Remove a market to add another.</p>
            )}
            <GameButton className="ml-auto" onClick={() => setOpen(false)}>
              Done
            </GameButton>
          </div>
        </Popover.Content>
      </Popover>
      {selected.length > 0 && (
        <ul aria-label="Selected markets" className="flex flex-wrap gap-1">
          {selected.map(({ center, name }) => (
            <li key={center}>
              <GameButton
                aria-label={`Remove ${name}`}
                className="px-2"
                onClick={() => {
                  remove(center);
                  trigger.current?.focus();
                }}
              >
                {name}
                <XMarkIcon aria-hidden="true" className="size-3.5 text-game-ink-500" />
              </GameButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
