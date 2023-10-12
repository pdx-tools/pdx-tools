import React, { useCallback, useState } from "react";
import { Select } from "@/components/Select";
import { useEu4Actions, useTagFilter } from "../store";
import { Button } from "@/components/Button";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { Sheet } from "@/components/Sheet";
import { CountrySelect } from "./CountrySelect";
import { ToggleRow } from "../features/settings/ToggleRow";

type AiState = ReturnType<typeof useTagFilter>["ai"];
const simpleFilter = (x: AiState) => {
  switch (x) {
    case "all":
    case "great":
      return x;
    case "alive":
      return "all";
    default:
      return "none";
  }
};

export const CountryFilterButton = () => {
  const filter = useTagFilter();
  const { updateTagFilter } = useEu4Actions();
  const value = simpleFilter(filter.ai);
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <Select
      value={value}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(x) => {
        updateTagFilter({
          ai: x as AiState,
        });
      }}
    >
      <Select.Trigger asChild>
        <Button variant="default" shape="square">
          <FunnelIcon className="h-4 w-4" />
        </Button>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="none">Players</Select.Item>
        <Select.Item value="great">+ Greats</Select.Item>
        <Select.Item value="all">+ Rest</Select.Item>

        <Sheet
          modal={false}
          open={drawerOpen}
          onOpenChange={(drawerOpen) => {
            if (!drawerOpen) {
              setOpen(false);
            }
            setDrawerOpen(drawerOpen);
          }}
        >
          <Sheet.Trigger asChild>
            <Button
              className="ml-1 mt-2 w-full justify-center"
              variant="default"
            >
              Custom
            </Button>
          </Sheet.Trigger>
          <Sheet.Content
            side="right"
            className="flex z-[1001] flex-col bg-white pt-4 w-[400px] transition-[width] duration-200"
          >
            <Sheet.Header className="z-[1] flex gap-2 px-4 pb-4 shadow-md items-center">
              <Sheet.Close />
              <Sheet.Title>Custom Country Filter</Sheet.Title>
            </Sheet.Header>
            <Sheet.Body className="px-4 pt-6 flex flex-col gap-2">
              <div>
                <p>Include Countries:</p>
                <CountryFilterSelect action="include" />
              </div>

              <div>
                <p>Exclude Countries:</p>
                <CountryFilterSelect action="exclude" />
              </div>

              <ToggleRow
                value={filter.includeSubjects}
                onChange={(x) => updateTagFilter({ includeSubjects: x })}
                text="Include Subjects"
              />
            </Sheet.Body>
          </Sheet.Content>
        </Sheet>
      </Select.Content>
    </Select>
  );
};

const CountryFilterSelect = ({ action }: { action: "include" | "exclude" }) => {
  const filter = useTagFilter();
  const actions = useEu4Actions();
  const tags = filter[action];
  const isSelected = useCallback((tag: string) => tags.includes(tag), [tags]);

  return (
    <CountrySelect
      isSelected={isSelected}
      onSelect={(tag) => {
        const selected = tags.includes(tag);
        const newTags = selected
          ? tags.filter((x) => x != tag)
          : [...tags, tag];
        actions.updateTagFilter({
          [action]: newTags,
        });
        return true;
      }}
    >
      {tags.length === 0 ? "(None)" : tags.join(", ")}
    </CountrySelect>
  );
};
