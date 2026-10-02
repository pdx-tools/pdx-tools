import { useCallback, useMemo, useState, memo, useRef } from "react";
import type { PropsWithChildren } from "react";
import { Popover } from "@/components/Popover";
import { Command } from "@/components/Command";
import { PlayIcon } from "@heroicons/react/20/solid";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { cx } from "class-variance-authority";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import type { CountryDisplay, Hoi4Metadata } from "../worker/types";

export const CountrySelect = memo(function CountrySelect({
  children,
  countries,
  landed,
  isSelected,
  onSelect,
}: PropsWithChildren<{
  countries: Hoi4Metadata["countries"];
  /** Countries that own land on the map, with names and colors */
  landed: CountryDisplay[];
  isSelected: (tag: string) => boolean;
  onSelect: (tag: string) => boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<string | undefined>();

  const selectRef = useRef(onSelect);
  useIsomorphicLayoutEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const select = useCallback((tag: string) => {
    const open = selectRef.current(tag);
    setInput("");
    setOpen(open);
  }, []);

  const others = useMemo(() => {
    const landedTags = new Set(landed.map((x) => x.tag));
    return countries
      .filter((tag) => !landedTags.has(tag))
      .map((tag) => ({ tag, name: tag, color: "" }));
  }, [countries, landed]);

  const search = input?.trim().toLocaleLowerCase() ?? "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button role="combobox" aria-expanded={open} className="w-52 justify-between">
          {children}
          <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
        </Button>
      </Popover.Trigger>
      <Popover.Content className="max-h-96 w-72 overflow-auto rounded-md bg-white p-4 shadow-md dark:bg-slate-800">
        <Command
          filter={(value) => {
            if (search.length == 0) {
              return 1;
            } else if (search.length <= 3) {
              // A short search matches the start of the tag (the last word)
              // or the start of a word in the name.
              const match =
                value.includes(search, value.length - 3) ||
                value.startsWith(search) ||
                value.includes(` ${search}`);
              return match ? 1 : 0;
            } else {
              return value.includes(search) ? 1 : 0;
            }
          }}
        >
          <Command.Input value={input} onValueChange={setInput} placeholder="Search countries" />
          <Command.List>
            <Command.Empty>No countries found.</Command.Empty>
            {landed.length > 0 ? (
              <CountrySelectGroup
                title="On the map"
                countries={landed}
                isSelected={isSelected}
                onSelect={select}
              />
            ) : null}
            <CountrySelectGroup
              title={landed.length > 0 ? "Other tags" : "Countries"}
              countries={others}
              isSelected={isSelected}
              onSelect={select}
            />
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover>
  );
});

type CountrySelectGroupProps = {
  title: string;
  countries: CountryDisplay[];
  onSelect: (tag: string) => void;
  isSelected: (tag: string) => boolean;
};

const CountrySelectGroup = memo(function CountrySelectGroup({
  title,
  countries,
  onSelect,
  isSelected,
}: CountrySelectGroupProps) {
  return (
    <Command.Group heading={title}>
      {countries.map((x) => (
        <Command.Item
          key={x.tag}
          value={`${x.name} ${x.tag}`.toLowerCase()}
          onSelect={() => onSelect(x.tag)}
        >
          <CheckIcon
            className={cx(
              "mr-2 h-4 w-4 shrink-0 opacity-0 data-selected:opacity-100",
              isSelected(x.tag) ? "opacity-100" : "opacity-0",
            )}
          />
          {x.color ? <CountrySwatch color={x.color} /> : null}
          <span className="truncate">{x.name}</span>
          {x.name !== x.tag ? (
            <span className="ml-auto pl-2 text-xs opacity-60">{x.tag}</span>
          ) : null}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

export function CountrySwatch({ color }: { color: string }) {
  return (
    <span
      className="mr-2 inline-block h-3 w-3 shrink-0 rounded-sm border border-black/30"
      style={{ backgroundColor: color }}
    />
  );
}
