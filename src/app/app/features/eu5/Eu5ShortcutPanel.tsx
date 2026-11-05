import { IconTip } from "./stack/parts";
import { useEu5Timeline } from "./store";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import QuestionMarkCircleIcon from "@heroicons/react/24/outline/QuestionMarkCircleIcon";
import { Kbd } from "@/components/game/Kbd";
import { cx } from "class-variance-authority";
import { Popover } from "@/components/Popover";
import { focusRing } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";

interface Shortcut {
  action: string;
  keys: string[];
}

interface ShortcutGroup {
  label: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Navigation",
    shortcuts: [
      { action: "Pan", keys: ["Drag"] },
      { action: "Pan", keys: ["W", "A", "S", "D"] },
      { action: "Zoom", keys: ["Scroll"] },
    ],
  },
  {
    label: "Selection",
    shortcuts: [
      { action: "Select a country", keys: ["Click"] },
      { action: "Add a country", keys: ["Shift", "+", "Click"] },
      { action: "Remove a country", keys: ["Alt", "+", "Click"] },
      { action: "Select a location in the selected country", keys: ["Click"] },
      { action: "Clear the selection", keys: ["Esc"] },
    ],
  },
  {
    label: "Select by area",
    shortcuts: [
      { action: "Countries in an area", keys: ["Shift", "+", "Drag"] },
      { action: "Remove countries in an area", keys: ["Alt", "+", "Drag"] },
      { action: "Locations in an area", keys: ["Ctrl", "+", "Drag"] },
    ],
  },
  {
    label: "Timeline",
    shortcuts: [
      { action: "Play or pause", keys: ["Space"] },
      { action: "Step a day", keys: ["←", "→"] },
      { action: "Step a month", keys: ["Shift", "+", "←", "→"] },
      { action: "Step a year", keys: ["Ctrl", "+", "←", "→"] },
      { action: "Campaign start or save date", keys: ["Home", "End"] },
      { action: "Previous or next save of the campaign", keys: ["[", "]"] },
    ],
  },
  {
    label: "Tools",
    shortcuts: [
      { action: "Map modes, in the order of the menu", keys: ["1", "–", "9"] },
      { action: "Search", keys: ["/"] },
      { action: "Full view or map", keys: ["M"] },
      { action: "Frame the selection", keys: ["F"] },
      { action: "Whole world", keys: ["0"] },
      { action: "Zoom in or out", keys: ["+", "\u2013"] },
      { action: "Remove the focused row from the selection", keys: ["Delete"] },
      { action: "Owner borders", keys: ["B"] },
      { action: "Back one level", keys: ["Esc"] },
      { action: "Toggle shortcuts", keys: ["?"] },
    ],
  },
];

/**
 * The keyboard shortcuts. The "?" key toggles them, so render one instance.
 * By default the panel has its own "?" button. With `anchor`, the panel
 * opens from the element that `anchor` gives (on a phone, the ⋯ menu),
 * and `anchor` gets the function that opens the panel.
 */
export function Eu5ShortcutPanel({ anchor }: { anchor?: (openPanel: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  // A save with no timeline has no use for its keys.
  const hasTimeline = useEu5Timeline().available;
  const groups = SHORTCUT_GROUPS.filter((group) => hasTimeline || group.label !== "Timeline");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchor ? (
        <Popover.Anchor asChild>
          <span className="flex shrink-0">{anchor(() => setOpen(true))}</span>
        </Popover.Anchor>
      ) : (
        <IconTip label="Keyboard shortcuts (?)">
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cx(
                "pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100",
                focusRing,
              )}
              aria-label="Keyboard shortcuts"
            >
              <QuestionMarkCircleIcon className="h-4 w-4" />
            </button>
          </Popover.Trigger>
        </IconTip>
      )}
      <Popover.Content
        aria-label="Keyboard shortcuts"
        side="bottom"
        align="center"
        sideOffset={16}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-[44rem] max-w-[calc(100vw-16px)] overflow-y-auto rounded-panel border border-game-line-strong bg-game-panel/95 p-0 font-game-ui shadow-2xl backdrop-blur-xl"
      >
        {/* Two columns, so the whole list is in view at 900px of height. */}
        <div className="gap-x-6 px-5 pt-3 pb-3 sm:columns-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-3 break-inside-avoid">
              <div className={cx("mb-2 pl-0.5", sectionLabel)}>{group.label}</div>
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-[3px]">
                  <span className="text-[12.5px] text-game-ink-300">{shortcut.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key, j) =>
                      key === "+" ? (
                        <span key={j} className="text-[12px] text-game-ink-500">
                          +
                        </span>
                      ) : (
                        <Kbd key={j} className="h-[22px] min-w-[22px] px-1.5">
                          {key}
                        </Kbd>
                      ),
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-1 border-t border-game-line py-2.5">
          <Kbd>?</Kbd>
          <span className="text-[12px] text-game-ink-500">to dismiss</span>
        </div>
      </Popover.Content>
    </Popover>
  );
}
