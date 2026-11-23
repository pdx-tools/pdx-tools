import PlayIcon from "@heroicons/react/20/solid/PlayIcon";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { ToggleGroup } from "@/components/ToggleGroup";
import { useCampaignSheet, useEu4Actions } from "@/features/eu4/store";
import type { ManaType, ManaUse } from "@/wasm/wasm_eu4";
import { MANA_TYPES, MANA_USES, typeName, useFullName, useName } from "./mana";
import type { ManaView } from "./mana";
import type { ManaOption } from "./figures";

/** The Mana family's one view row: the subject or use, and the types. */
export function ManaViewRow({
  option,
  subject,
}: {
  option: ManaOption;
  /** By use: the countries to choose from, and the chosen one. */
  subject?: {
    options: readonly { key: string; name: string }[];
    value: string | null;
    onChange: (key: string) => void;
  };
}) {
  const sheet = useCampaignSheet();
  const { setCampaignSheet } = useEu4Actions();
  const view = sheet.mana;
  const set = (patch: Partial<ManaView>) => setCampaignSheet({ mana: { ...view, ...patch } });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {subject && subject.options.length > 0 && (
        <MenuSelect
          label="Country"
          value={subject.value ?? subject.options[0].key}
          onChange={subject.onChange}
          options={subject.options.map((x) => ({ value: x.key, label: x.name }))}
        />
      )}
      {option === "country" && (
        <MenuSelect
          label="Use"
          value={view.use}
          onChange={(x) => set({ use: x as ManaView["use"] })}
          options={[
            { value: "all", label: "All uses" },
            // The closed menu shows the short label; the list gives the full name.
            ...MANA_USES.map((x: ManaUse) => ({
              value: x,
              label: useFullName[x],
              short: useName[x],
            })),
          ]}
        />
      )}
      {option === "banked" ? (
        <Segment
          label="Mana type"
          value={view.pool}
          options={MANA_TYPES.map((x) => ({ value: x, label: typeName[x] }))}
          onChange={(x) => set({ pool: x as ManaType })}
        />
      ) : (
        <Segment
          label="Mana type"
          value={view.types}
          options={[
            { value: "all", label: "All" },
            ...MANA_TYPES.map((x) => ({ value: x, label: typeName[x] })),
          ]}
          onChange={(x) => set({ types: x as ManaView["types"] })}
        />
      )}
    </div>
  );
}

function MenuSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A short label shows in the closed menu, when given. */
  options: readonly { value: string; label: string; short?: string }[];
}) {
  const chosen = options.find((x) => x.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger asChild className="h-8 min-w-32">
        <Button aria-label={label} className="text-sm" title={chosen?.label}>
          <Select.Value>{chosen?.short ?? chosen?.label}</Select.Value>
          <Select.Icon asChild>
            <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Content>
        {options.map((x) => (
          <Select.Item key={x.value} value={x.value}>
            {x.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
}

function Segment({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      className="inline-flex rounded-md border border-solid border-gray-300 bg-white p-0.5 dark:border-gray-600 dark:bg-slate-900"
      value={value}
      onValueChange={(x: string) => x && onChange(x)}
    >
      {options.map((x) => (
        <ToggleGroup.Item key={x.value} value={x.value} variant="segment">
          {x.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
}
