import { Button } from "@/components/Button";
import { PlayIcon } from "@heroicons/react/20/solid";
import { Select } from "@/components/Select";
import { useVic3Meta } from "./store";
import { useMemo } from "react";

export interface TagSelectProps {
  value: string;
  onChange: (s: string) => void;
}
export const TagSelect = ({ value, onChange }: TagSelectProps) => {
  const { availableTags } = useVic3Meta();
  const uniqueTags = useMemo(
    () => [...new Set(availableTags)].sort(),
    [availableTags],
  );

  return (
    <Select key={value} value={value} onValueChange={onChange}>
      <Select.Trigger asChild className="h-10 w-60">
        <Button>
          <Select.Value placeholder="Select country tag" />
          <Select.Icon asChild>
            <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Content className="max-h-96">
        {uniqueTags.map((tag) => (
          <Select.Item key={tag} value={tag}>
            {tag}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};
