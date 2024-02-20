import { Button } from "@/components/Button";
import { PlayIcon } from "@heroicons/react/20/solid";
import { Select } from "@/components/Select";

export interface TagSelectProps {
  value: string;
  tags: [string];
  onChange: (s: string | undefined) => void;
}
export const TagSelect = ({ value, tags, onChange }: TagSelectProps) => {
  const tag_items = [];
  const unique_tags = tags.filter(function (elem, index, self) {
    return index === self.indexOf(elem);
  });
  for (var t of unique_tags) {
    tag_items.push(
      <Select.Item key={t} value={t}>
        {t}
      </Select.Item>,
    );
  }
  return (
    <Select key={value ?? "def"} value={value} onValueChange={onChange}>
      <Select.Trigger asChild className="h-10 w-60">
        <Button>
          <Select.Value placeholder="Select country tag" />
          <Select.Icon asChild>
            <PlayIcon className="h-3 w-3 rotate-90 opacity-50 self-center" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Content className="max-h-96">{tag_items}</Select.Content>
    </Select>
  );
};
