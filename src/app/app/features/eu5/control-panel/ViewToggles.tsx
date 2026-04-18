import * as Toggle from "@radix-ui/react-toggle";
import { Tooltip } from "@/components/Tooltip";
import { useEu5Engine, useEu5OwnerBorders } from "../store";

export function ViewToggles() {
  const engine = useEu5Engine();
  const ownerBordersEnabled = useEu5OwnerBorders();

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 font-mono text-[9.5px] font-medium tracking-[0.2em] text-eu5-ink-500 uppercase">
        View
      </span>

      <Tooltip>
        <Tooltip.Trigger asChild>
          <span>
            <Toggle.Root
              pressed={ownerBordersEnabled}
              onPressedChange={() => engine.trigger.toggleOwnerBorders()}
              aria-label="Owner Borders"
              className="grid h-7 w-7 place-items-center rounded text-eu5-ink-500 transition-colors duration-100 hover:bg-eu5-bg-hover hover:text-eu5-ink-100 data-[state=on]:bg-eu5-bronze-500/15 data-[state=on]:text-eu5-bronze-100"
            >
              <svg
                viewBox="0 0 12 12"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1" y="1" width="10" height="10" rx="1" />
                <rect x="3.5" y="3.5" width="5" height="5" rx="0.5" />
              </svg>
            </Toggle.Root>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" className="text-xs">
          Owner Borders
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}
