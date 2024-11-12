import React, { useCallback, useState } from "react";
import { Select } from "@/components/Select";
import { useEu4Actions, useTagFilter } from "../store";
import { Button } from "@/components/Button";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { CountrySelect } from "./CountrySelect";
import { ToggleRow } from "../features/settings/ToggleRow";
import { Dialog } from "@/components/Dialog";
import { formatList } from "@/lib/format";

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

        <Dialog
          open={drawerOpen}
          onOpenChange={(drawerOpen) => {
            if (!drawerOpen) {
              setOpen(false);
            }
            setDrawerOpen(drawerOpen);
          }}
        >
          <Dialog.Trigger asChild>
            <Button
              className="ml-1 mt-2 w-full justify-center"
              variant="default"
            >
              Custom
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Custom Country Filter</Dialog.Title>
            <div className="flex flex-col gap-2 px-4">
              <div className="flex justify-between">
                <div>
                  <p>Include Countries:</p>
                  <CountryFilterSelect action="include" />
                </div>

                <div>
                  <p>Exclude Countries:</p>
                  <CountryFilterSelect action="exclude" />
                </div>
              </div>

              <ToggleRow
                value={filter.includeSubjects}
                onChange={(x) => updateTagFilter({ includeSubjects: x })}
                text="Include Subjects"
              />
            </div>
            <div className="flex justify-end">
              <Dialog.Close asChild>
                <Button variant="default">Ok</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog>
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
      {formatList(tags)}
    </CountrySelect>
  );
};
