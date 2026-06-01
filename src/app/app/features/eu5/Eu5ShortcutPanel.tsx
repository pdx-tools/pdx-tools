import { useState, useEffect } from "react";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { Popover } from "@/components/Popover";

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
      { action: "Select entity", keys: ["Click"] },
      { action: "Add to selection", keys: ["Shift", "+", "Click"] },
      { action: "Remove from selection", keys: ["Alt", "+", "Click"] },
      { action: "Focus location in selected entity", keys: ["Click"] },
      { action: "Clear focused location", keys: ["Click"] },
      { action: "Replace selection", keys: ["Click"] },
      { action: "Clear focus or selection", keys: ["Empty", "+", "Click"] },
      { action: "Clear focus or selection", keys: ["Esc"] },
    ],
  },
  {
    label: "Box select",
    shortcuts: [
      { action: "Select area", keys: ["Shift", "+", "Drag"] },
      { action: "Remove area", keys: ["Alt", "+", "Drag"] },
      { action: "Location box-select (replace)", keys: ["Ctrl", "+", "Drag"] },
      { action: "Location box-select (add)", keys: ["Ctrl", "+", "Shift", "+", "Drag"] },
      { action: "Location box-select (remove)", keys: ["Ctrl", "+", "Alt", "+", "Drag"] },
    ],
  },
  {
    label: "Tools",
    shortcuts: [
      { action: "Search", keys: ["/"] },
      { action: "Toggle shortcuts", keys: ["?"] },
    ],
  },
];

export function Eu5ShortcutPanel() {
  const [open, setOpen] = useState(false);

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
      <Popover.Trigger asChild>
        <button
          type="button"
          className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 focus-visible:ring-2 focus-visible:ring-game-accent-line focus-visible:outline-none"
          aria-label="Keyboard shortcuts"
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={16}
        className="w-104 rounded-panel border border-game-line-strong bg-game-panel/95 p-0 font-game-ui shadow-2xl backdrop-blur-xl"
      >
        <div className="px-5 pt-4 pb-5">
          {SHORTCUT_GROUPS.map((group, groupIdx) => (
            <div key={group.label}>
              {groupIdx > 0 && <div className="my-3 h-px bg-game-line" />}
              <div className="mb-2 pl-0.5 font-game-num text-[10px] font-medium tracking-[0.18em] text-game-ink-500 uppercase">
                {group.label}
              </div>
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-[5px]">
                  <span className="text-[13px] text-game-ink-300">{shortcut.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key, j) =>
                      key === "+" ? (
                        <span key={j} className="text-[10px] text-game-ink-700">
                          +
                        </span>
                      ) : (
                        <kbd
                          key={j}
                          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-plate border border-game-line-strong bg-game-panel-2 px-1.5 font-game-num text-[11px] text-game-ink-300"
                        >
                          {key}
                        </kbd>
                      ),
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-1 border-t border-game-line py-2.5">
          <kbd className="inline-flex h-[18px] min-w-[16px] items-center justify-center rounded-plate border border-game-line-strong bg-game-panel-2 px-1 font-game-num text-[10px] text-game-ink-500">
            ?
          </kbd>
          <span className="text-[11px] text-game-ink-500">to dismiss</span>
        </div>
      </Popover.Content>
    </Popover>
  );
}
