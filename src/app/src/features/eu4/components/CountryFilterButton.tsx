import React from "react";
import { FilterOutlined } from "@ant-design/icons";
import { Select } from "@/components/Select";
import { useEu4Actions, useTagFilter } from "../store";
import { Button } from "@/components/Button";

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
  return (
    <Select
      value={value}
      onValueChange={(x) => {
        updateTagFilter({
          ai: x as AiState,
        });
      }}
    >
      <Select.Trigger asChild>
        <Button variant="default" shape="square">
          <FilterOutlined />
        </Button>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="none">Players</Select.Item>
        <Select.Item value="great">+ Greats</Select.Item>
        <Select.Item value="all">+ Rest</Select.Item>
      </Select.Content>
    </Select>
  );
};
