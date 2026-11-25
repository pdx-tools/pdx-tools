import { Toggle } from "radix-ui";
import { Tooltip } from "@/components/Tooltip";
import { Kbd } from "@/components/game/Kbd";
import { useEu5Engine, useEu5MapNamesVisible, useEu5OwnerBorders } from "../store";

export function ViewToggles() {
  const engine = useEu5Engine();
  const ownerBordersEnabled = useEu5OwnerBorders();
  const namesVisible = useEu5MapNamesVisible();

  return (
    <div className="flex items-center gap-1">
      <ViewToggle
        label="Owner Borders"
        pressed={ownerBordersEnabled}
        onPressedChange={() => engine.trigger.toggleOwnerBorders()}
      >
        <rect x="1" y="1" width="10" height="10" rx="1" />
        <rect x="3.5" y="3.5" width="5" height="5" rx="0.5" />
      </ViewToggle>
      <ViewToggle
        label="Names"
        shortcut="N"
        pressed={namesVisible}
        onPressedChange={(pressed) => engine.trigger.setMapNamesVisible(pressed)}
      >
        <path d="M2 10.5 6 1.5l4 9M3.4 7.5h5.2" strokeLinecap="round" strokeLinejoin="round" />
      </ViewToggle>
    </div>
  );
}

function ViewToggle({
  label,
  shortcut,
  pressed,
  onPressedChange,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** The parts of a 12 by 12 icon */
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span>
          <Toggle.Root
            pressed={pressed}
            onPressedChange={onPressedChange}
            aria-label={label}
            aria-keyshortcuts={shortcut}
            className="grid h-7 w-7 place-items-center rounded text-game-ink-500 transition-colors duration-100 hover:bg-game-panel-hover hover:text-game-ink-100 data-[state=on]:bg-game-accent-500/15 data-[state=on]:text-game-accent-100"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {children}
            </svg>
          </Toggle.Root>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="flex items-center gap-2 text-xs">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </Tooltip.Content>
    </Tooltip>
  );
}
