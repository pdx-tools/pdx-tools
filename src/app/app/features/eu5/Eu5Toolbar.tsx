import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useEu5SelectionState, useEu5Engine } from "./store";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Command as CommandPrimitive } from "cmdk";
import { cx } from "class-variance-authority";
import { formatInt } from "@/lib/format";
import type { SearchResult } from "./ui-engine";
import styles from "./Eu5Toolbar.module.css";

export function Eu5Toolbar() {
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = useEu5Engine();
  const selectionState = useEu5SelectionState();

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
        setSearchActive(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchActive]);

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

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      await engine.trigger.selectCountry(result.locationIdx);
      setQuery("");
      setResults([]);
    },
    [engine],
  );

  const handleDismiss = useCallback(() => {
    setSearchActive(false);
    setQuery("");
    setResults([]);
  }, []);

  const countryResults = useMemo(() => results.filter((r) => r.kind === "country"), [results]);
  const hasResults = countryResults.length > 0;
  const showDropdown = searchActive && (hasResults || (query.trim().length > 0 && !isSearching));

  return (
    <div
      className={cx(
        "absolute top-4 left-1/2 z-20 -translate-x-1/2",
        searchActive ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Click-away backdrop when dropdown is open */}
      {showDropdown && (
        <div className="pointer-events-auto fixed inset-0 z-[-1]" onClick={handleDismiss} />
      )}

      <div
        className={cx(
          "relative flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 shadow-xl backdrop-blur-md",
          "transition-all duration-200",
          searchActive ? "w-[24rem] px-3 py-2" : "px-3 py-2",
        )}
      >
        {/* Search icon — always interactive */}
        <button
          type="button"
          onClick={() => setSearchActive(true)}
          className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-200"
          aria-label="Search countries"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </button>

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
              placeholder="Search countries..."
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
                            key={result.id}
                            onSelect={() => handleSelect(result)}
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
                  </CommandPrimitive.List>
                </div>
              </div>
            )}
          </CommandPrimitive>
        ) : (
          selectionState &&
          !selectionState.isEmpty && (
            <span className="text-sm text-slate-100">
              {formatSelectionSummary(selectionState.entityCount, selectionState.locationCount)}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function formatSelectionSummary(entityCount: number, locationCount: number): string {
  const locPart = locationCount === 1 ? "1 location" : `${formatInt(locationCount)} locations`;
  if (entityCount === 1) return locPart;
  return `${formatInt(entityCount)} entities — ${locPart}`;
}
