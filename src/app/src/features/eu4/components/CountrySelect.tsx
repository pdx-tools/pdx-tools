import {
  PropsWithChildren,
  useCallback,
  useState,
  memo,
  useRef,
  useMemo,
} from "react";
import { Popover } from "@/components/Popover";
import { Command } from "@/components/Command";
import { EnhancedCountryInfo } from "../types/models";
import { PlayIcon } from "@heroicons/react/20/solid";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useExistedAiCountries, useHumanCountries } from "../store";
import { Button } from "@/components/Button";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/Badge";

export const CountrySelect = memo(function CountrySelect({
  children,
  isSelected,
  onSelect,
}: PropsWithChildren<{
  isSelected: (tag: string) => boolean;
  onSelect: (tag: string) => boolean;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button role="combobox" className="w-52 justify-between">
          {children}
          <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
        </Button>
      </Popover.Trigger>
      <Popover.Content className="max-h-96 w-80 overflow-auto">
        <SelectContent
          onSelect={onSelect}
          isSelected={isSelected}
          setOpen={setOpen}
        />
      </Popover.Content>
    </Popover>
  );
});

function SelectContent({
  onSelect,
  isSelected,
  setOpen,
}: {
  onSelect: (tag: string) => boolean;
  isSelected: (tag: string) => boolean;
  setOpen: (arg: boolean) => void;
}) {
  const [input, setInput] = useState<string | undefined>();
  const humanCountries = useHumanCountries();
  const aiCountries = useExistedAiCountries();
  const search = input?.trim().toLocaleLowerCase() ?? "";

  const filteredCountries = useMemo(() => {
    type Fab = EnhancedCountryInfo & { badge?: string };

    function scorer<T extends EnhancedCountryInfo>(
      countries: T[],
      search: string,
    ) {
      let needsSorting = true;
      const scores: [number, number][] = [];

      for (let i = 0; i < countries.length; i++) {
        const country = countries[i];
        const normalName = country.normalizedName.toLowerCase();
        const normalTag = country.tag.toLowerCase();

        if (search === normalName || search === normalTag) {
          scores.push([2, i]);
          needsSorting = true;
        } else if (normalName.includes(search) || normalTag.includes(search)) {
          scores.push([1, i]);
        }
      }

      if (needsSorting) {
        scores.sort(([ascore], [bscore]) => bscore - ascore);
      }

      return scores.map(([_, index]) => countries[index]);
    }

    const filteredHumans: Fab[] = humanCountries.map((x) => ({
      badge: "player",
      ...x,
    }));
    const filteredAi: Fab[] = aiCountries;

    return scorer(filteredHumans.concat(filteredAi), search);
  }, [humanCountries, aiCountries, search]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredCountries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
  });

  const selectRef = useRef(onSelect);
  useIsomorphicLayoutEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const select = useCallback(
    (tag: string) => {
      const open = selectRef.current(tag);
      setInput("");
      setOpen(open);
    },
    [setOpen],
  );

  return (
    <Command shouldFilter={false}>
      <Command.Input
        value={input}
        onValueChange={setInput}
        placeholder="Search countries"
      />
      <Command.List ref={parentRef}>
        {filteredCountries.length == 0 && (
          <Command.Empty>No countries found.</Command.Empty>
        )}
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const x = filteredCountries[row.index];
            return (
              <Command.Item
                key={row.index}
                onSelect={() => select(x.tag)}
                className="absolute left-0 top-0 w-full"
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {isSelected(x.tag) && (
                  <CheckIcon className="absolute mr-2 h-4 w-4" />
                )}
                <span className="grow pl-6">
                  {x.name} ({x.tag})
                </span>
                {x.badge && <Badge variant="blue">{x.badge}</Badge>}
              </Command.Item>
            );
          })}
        </div>
      </Command.List>
    </Command>
  );
}
