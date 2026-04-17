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
          className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-200"
          aria-label="Keyboard shortcuts"
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={16}
        className="w-[26rem] rounded-2xl border border-white/10 bg-slate-950/90 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="px-5 pt-4 pb-5">
          {SHORTCUT_GROUPS.map((group, groupIdx) => (
            <div key={group.label}>
              {groupIdx > 0 && <div className="my-3 h-px bg-white/6" />}
              <div className="mb-2 pl-0.5 text-[10px] font-medium tracking-[0.18em] text-slate-500 uppercase">
                {group.label}
              </div>
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-[5px]">
                  <span className="text-[13px] text-slate-400">{shortcut.action}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key, j) =>
                      key === "+" ? (
                        <span key={j} className="text-[10px] text-slate-600">
                          +
                        </span>
                      ) : (
                        <kbd
                          key={j}
                          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-white/10 bg-white/6 px-1.5 font-mono text-[11px] text-slate-300"
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

        <div className="flex items-center justify-center gap-1 border-t border-white/6 py-2.5">
          <kbd className="inline-flex h-[18px] min-w-[16px] items-center justify-center rounded-[4px] border border-white/10 bg-white/6 px-1 font-mono text-[10px] text-slate-400">
            ?
          </kbd>
          <span className="text-[11px] text-slate-500">to dismiss</span>
        </div>
      </Popover.Content>
    </Popover>
  );
}
