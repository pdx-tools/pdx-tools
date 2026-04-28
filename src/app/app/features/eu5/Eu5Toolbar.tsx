import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useEu5SelectionState, useEu5Engine } from "./store";
import { usePanToEntity } from "./usePanToEntity";
import { MagnifyingGlassIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Popover } from "@/components/Popover";
import { Command as CommandPrimitive } from "cmdk";
import { cx } from "class-variance-authority";
import { formatInt } from "@/lib/format";
import type { SearchResult } from "./ui-engine";
import styles from "./Eu5Toolbar.module.css";
import { Eu5ShortcutPanel } from "./Eu5ShortcutPanel";

export function Eu5Toolbar() {
  const [searchActive, setSearchActive] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = useEu5Engine();
  const selectionState = useEu5SelectionState();

  const openSearch = useCallback(() => {
    setPresetMenuOpen(false);
    setSearchActive(true);
  }, []);

  // Global "/" shortcut to open search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !searchActive &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchActive, openSearch]);

  // Auto-focus input when search activates
  useEffect(() => {
    if (searchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchActive]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const hits = await engine.trigger.searchEntities(query.trim());
        setResults(hits);
      } finally {
        setIsSearching(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [query, engine]);

  const panToEntity = usePanToEntity();

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      if (result.kind === "location") {
        await engine.trigger.setFocusedLocation(result.locationIdx);
      } else {
        await engine.trigger.selectEntity(result.locationIdx);
      }
      panToEntity(result.locationIdx);
      setSearchActive(false);
      setQuery("");
      setResults([]);
    },
    [engine, panToEntity],
  );

  const handleDismiss = useCallback(() => {
    setSearchActive(false);
    setQuery("");
    setResults([]);
  }, []);

  const handleSelectPlayers = useCallback(async () => {
    setPresetMenuOpen(false);
    await engine.trigger.selectPlayers();
  }, [engine]);

  const handleClearSelection = useCallback(async () => {
    await engine.trigger.clearSelection();
  }, [engine]);

  const countryResults = useMemo(() => results.filter((r) => r.kind === "country"), [results]);
  const locationResults = useMemo(() => results.filter((r) => r.kind === "location"), [results]);
  const hasResults = countryResults.length > 0 || locationResults.length > 0;
  const showDropdown = searchActive && (hasResults || (query.trim().length > 0 && !isSearching));

  const hasSelection = selectionState != null && !selectionState.isEmpty;
  const presetActive = selectionState?.preset != null;

  return (
    <div
      className={cx(
        "absolute top-4 left-1/2 z-20 -translate-x-1/2",
        searchActive ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Click-away backdrop for search dropdown */}
      {showDropdown && (
        <div className="pointer-events-auto fixed inset-0 z-[-1]" onClick={handleDismiss} />
      )}

      <div
        className={cx(
          "relative flex items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-950/80 px-2 py-2 shadow-xl backdrop-blur-md",
          "transition-all duration-200",
          searchActive && "w-[24rem]",
        )}
      >
        {/* Search icon */}
        <button
          type="button"
          onClick={openSearch}
          className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-200"
          aria-label="Search countries or locations"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </button>

        {/* Preset/filter button — hidden while search is open */}
        {!searchActive && (
          <Popover open={presetMenuOpen} onOpenChange={setPresetMenuOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={cx(
                  "pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                  presetMenuOpen || presetActive
                    ? "text-sky-300"
                    : "text-slate-400 hover:text-slate-200",
                )}
                aria-label="Presets"
              >
                <FunnelIcon className="h-4 w-4" />
              </button>
            </Popover.Trigger>
            <Popover.Content
              side="bottom"
              align="center"
              sideOffset={12}
              className="w-36 rounded-xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => void handleSelectPlayers()}
                className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100"
              >
                Players
              </button>
            </Popover.Content>
          </Popover>
        )}

        {/* Thin divider — shown when toolbar has content to the right */}
        {!searchActive && hasSelection && (
          <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
        )}

        {/* Search input OR selection chip */}
        {searchActive ? (
          <CommandPrimitive shouldFilter={false} className="flex-1">
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  handleDismiss();
                }
              }}
              placeholder="Search countries or locations..."
              className="h-7 w-full border-0 bg-transparent px-0 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />

            {showDropdown && (
              <div className="absolute top-full right-0 left-0 mt-2">
                <div className="rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-md">
                  <CommandPrimitive.List className="max-h-[20rem] overflow-y-auto p-1.5">
                    <CommandPrimitive.Empty className="py-4 text-center text-xs text-slate-500">
                      No results found
                    </CommandPrimitive.Empty>

                    {countryResults.length > 0 && (
                      <CommandPrimitive.Group
                        heading="Countries"
                        className={cx("overflow-hidden", styles.searchGroup)}
                      >
                        {countryResults.map((result) => (
                          <CommandPrimitive.Item
                            key={`country-${result.id}`}
                            onSelect={() => void handleSelect(result)}
                            className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-300 outline-none select-none aria-selected:bg-white/10 aria-selected:text-slate-100"
                          >
                            <span className="shrink-0 font-mono text-[11px] text-slate-500">
                              {result.tag}
                            </span>
                            <span className="truncate">{result.name}</span>
                          </CommandPrimitive.Item>
                        ))}
                      </CommandPrimitive.Group>
                    )}

                    {locationResults.length > 0 && (
                      <CommandPrimitive.Group
                        heading="Locations"
                        className={cx("overflow-hidden", styles.searchGroup)}
                      >
                        {locationResults.map((result) => (
                          <CommandPrimitive.Item
                            key={`location-${result.id}`}
                            onSelect={() => void handleSelect(result)}
                            className="flex cursor-default items-center rounded-lg px-2.5 py-2 text-sm text-slate-300 outline-none select-none aria-selected:bg-white/10 aria-selected:text-slate-100"
                          >
                            <span className="truncate">{result.name}</span>
                          </CommandPrimitive.Item>
                        ))}
                      </CommandPrimitive.Group>
                    )}
                  </CommandPrimitive.List>
                </div>
              </div>
            )}
          </CommandPrimitive>
        ) : (
          hasSelection && (
            <span className="px-0.5 text-sm text-slate-100">
              {selectionState.preset === "players"
                ? "Players preset"
                : formatSelectionSummary(selectionState.entityCount, selectionState.locationCount)}
            </span>
          )
        )}

        {/* Clear button — shown when there is an active selection */}
        {!searchActive && hasSelection && (
          <button
            type="button"
            onClick={() => void handleClearSelection()}
            className="pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-200"
            aria-label="Clear selection"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Shortcuts toggle — always at right edge */}
        <Eu5ShortcutPanel />
      </div>
    </div>
  );
}

function formatSelectionSummary(entityCount: number, locationCount: number): string {
  const locPart = locationCount === 1 ? "1 location" : `${formatInt(locationCount)} locations`;
  if (entityCount === 1) return locPart;
  return `${formatInt(entityCount)} entities — ${locPart}`;
}
