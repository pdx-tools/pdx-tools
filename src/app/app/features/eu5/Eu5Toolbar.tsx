import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useEu5SelectionState, useEu5Engine } from "./store";
import { usePanToEntity } from "./usePanToEntity";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Command as CommandPrimitive } from "cmdk";
import { cx } from "class-variance-authority";
import type { SearchResult } from "./ui-engine";
import styles from "./Eu5Toolbar.module.css";
import { Eu5ShortcutPanel } from "./Eu5ShortcutPanel";

export function Eu5Toolbar() {
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = useEu5Engine();
  const selectionState = useEu5SelectionState();

  const openSearch = useCallback(() => {
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
      if (result.kind === "country") {
        await engine.trigger.selectCountry(result.locationIdx);
      } else {
        await engine.trigger.setFocusedLocation(result.locationIdx);
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
    await engine.trigger.selectPlayers();
  }, [engine]);

  const countryResults = useMemo(() => results.filter((r) => r.kind === "country"), [results]);
  const locationResults = useMemo(() => results.filter((r) => r.kind === "location"), [results]);
  const hasResults = countryResults.length > 0 || locationResults.length > 0;
  const showDropdown = searchActive && (hasResults || (query.trim().length > 0 && !isSearching));

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
          "relative flex items-center gap-1 rounded-[4px] border border-game-line-strong bg-game-overlay px-1.5 py-1.5 font-game-ui shadow-xl backdrop-blur-md",
          "transition-all duration-200",
          searchActive && "w-[24rem]",
        )}
      >
        {/* Search trigger — icon + kbd hint share one hit target */}
        <button
          type="button"
          onClick={openSearch}
          className="pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-[3px] px-1.5 text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 focus-visible:ring-2 focus-visible:ring-game-accent-line focus-visible:outline-none"
          aria-label="Search countries or locations"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
          {!searchActive && (
            <kbd className="rounded-[2px] border border-game-line px-1 py-px font-game-num text-[9.5px] text-game-ink-500">
              /
            </kbd>
          )}
        </button>

        {/* Preset buttons + surrounding separators — hidden while search is open */}
        {!searchActive && (
          <>
            <span className="h-4 w-px shrink-0 bg-game-line-strong" aria-hidden="true" />
            <button
              type="button"
              onClick={() => void handleSelectPlayers()}
              className={cx(
                "pointer-events-auto h-7 shrink-0 rounded-[3px] px-3 text-[10.5px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-game-accent-line focus-visible:outline-none",
                selectionState?.preset === "players"
                  ? "bg-game-accent-soft text-game-accent-100 shadow-[inset_0_-1px_0_var(--color-game-accent-300)]"
                  : "text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100",
              )}
            >
              Players
            </button>
            <span className="h-4 w-px shrink-0 bg-game-line-strong" aria-hidden="true" />
          </>
        )}

        {/* Search input */}
        {searchActive && (
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
              className="h-7 w-full border-0 bg-transparent px-0 text-[12.5px] text-game-ink-100 outline-none placeholder:text-game-ink-700"
            />

            {showDropdown && (
              <div className="absolute top-full right-0 left-0 mt-2">
                <div className="rounded-[4px] border border-game-line-strong bg-game-panel/95 shadow-2xl backdrop-blur-md">
                  <CommandPrimitive.List className="max-h-[20rem] overflow-y-auto p-1.5">
                    <CommandPrimitive.Empty className="py-4 text-center text-xs text-game-ink-500">
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
                            className="flex cursor-default items-center gap-2 rounded-[2px] px-2.5 py-2 text-[12.5px] text-game-ink-300 outline-none select-none aria-selected:bg-game-panel-hover aria-selected:text-game-ink-100"
                          >
                            <span className="shrink-0 font-game-num text-[11px] text-game-ink-700">
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
                            className="flex cursor-default items-center rounded-[2px] px-2.5 py-2 text-[12.5px] text-game-ink-300 outline-none select-none aria-selected:bg-game-panel-hover aria-selected:text-game-ink-100"
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
        )}

        {/* Shortcuts toggle — always at right edge */}
        {!searchActive && <Eu5ShortcutPanel />}
      </div>
    </div>
  );
}
