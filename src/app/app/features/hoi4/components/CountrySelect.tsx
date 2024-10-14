import { PropsWithChildren, useCallback, useState, memo, useRef } from "react";
import { Popover } from "@/components/Popover";
import { Command } from "@/components/Command";
import { PlayIcon } from "@heroicons/react/20/solid";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { cx } from "class-variance-authority";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { Hoi4Metadata } from "../worker/types";

export const CountrySelect = memo(function CountrySelect({
  children,
  countries,
  isSelected,
  onSelect,
}: PropsWithChildren<{
  countries: Hoi4Metadata["countries"];
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

  const search = input?.trim().toLocaleLowerCase() ?? "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          role="combobox"
          aria-expanded={open}
          className="w-52 justify-between"
        >
          {children}
          <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
        </Button>
      </Popover.Trigger>
      <Popover.Content className="max-h-96 w-72 overflow-auto">
        <Command
          filter={(value) => {
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
          <Command.List>
            <Command.Empty>No countries found.</Command.Empty>
            <CountrySelectGroup
              title="Countries"
              countries={countries}
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
  countries: Hoi4Metadata["countries"];
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
          key={x}
          value={x.toLowerCase()}
          onSelect={() => onSelect(x)}
        >
          <CheckIcon
            className={cx(
              "mr-2 h-4 w-4 opacity-0 data-[selected]:opacity-100",
              isSelected(x) ? "opacity-100" : "opacity-0",
            )}
          />
          {x}
        </Command.Item>
      ))}
    </Command.Group>
  );
});
