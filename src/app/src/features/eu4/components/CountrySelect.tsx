import { PropsWithChildren, useCallback, useState, memo, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/Popover";
import { Command } from "@/components/Command";
import { EnhancedCountryInfo } from "../types/models";
import { PlayIcon } from "@heroicons/react/20/solid";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useExistedAiCountries, useHumanCountries } from "../store";
import { Button } from "@/components/Button";
import { cx } from "class-variance-authority";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

export const CountrySelect = memo(function CountrySelect({
  children,
  isSelected,
  onSelect,
}: PropsWithChildren<{
  isSelected: (tag: string) => boolean;
  onSelect: (tag: string) => boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<string | undefined>();
  const humanCountries = useHumanCountries();
  const aiCountries = useExistedAiCountries();

  const selectRef = useRef(onSelect);
  useIsomorphicLayoutEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const select = useCallback((tag: string) => {
    const open = selectRef.current(tag);
    setInput("");
    setOpen(open);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          role="combobox"
          aria-expanded={open}
          className="w-52 justify-between"
        >
          {children}
          <PlayIcon className="h-3 w-3 rotate-90 opacity-50 self-center" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-64 overflow-auto">
        <Command
          filter={(value, search) => {
            if (search.length == 0) {
              return 1;
            } else if (search.length <= 3) {
              return value.includes(search, value.length - 3) ? 1 : 0;
            } else {
              return value.includes(search) ? 1 : 0;
            }
          }}
        >
          <Command.Input
            value={input}
            onValueChange={setInput}
            placeholder="Search countries"
          />
          <Command.Empty>No countries found.</Command.Empty>
          <CountrySelectGroup
            title="Players"
            countries={humanCountries}
            isSelected={isSelected}
            onSelect={select}
          />
          <CountrySelectGroup
            title="AI"
            countries={aiCountries}
            isSelected={isSelected}
            onSelect={select}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
});

type CountrySelectGroupProps = {
  title: string;
  countries: EnhancedCountryInfo[];
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
          value={x.normalizedName + x.tag}
          onSelect={() => onSelect(x.tag)}
        >
          <CheckIcon
            className={cx(
              "mr-2 h-4 w-4 opacity-0 data-[selected]:opacity-100",
              isSelected(x.tag) ? "opacity-100" : "opacity-0",
            )}
          />
          {x.name} ({x.tag})
        </Command.Item>
      ))}
    </Command.Group>
  );
});
