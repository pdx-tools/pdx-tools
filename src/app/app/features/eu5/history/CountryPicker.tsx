import CheckIcon from "@heroicons/react/24/outline/CheckIcon";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { HistorySearchPicker } from "./HistorySearchPicker";

export const worldHistoryLabel = "World · owned locations";

export type CountryChoice = {
  countryId: number;
  name: string;
  tag: string;
};

export function CountryPicker({
  countries,
  selected,
  onChange,
}: {
  countries: CountryChoice[];
  selected?: CountryChoice;
  onChange: (countryId: number | undefined) => void;
}) {
  const label = selected?.name ?? worldHistoryLabel;
  const options: { countryId: number | undefined; name: string; tag?: string }[] = [
    { countryId: undefined, name: worldHistoryLabel },
    ...countries,
  ];
  return (
    <div className="space-y-1 text-xs text-game-ink-300">
      <div>Country</div>
      <HistorySearchPicker
        title="Select country"
        searchLabel="Search countries"
        triggerText={label}
        triggerLabel={`Country, ${label}`}
      >
        {(query, close) => {
          const matches = options.filter(
            ({ name, tag }) =>
              name.toLowerCase().includes(query) ||
              (tag !== undefined && tag.toLowerCase().includes(query)),
          );
          return (
            <div role="group" aria-label="Countries" className="min-h-0 overflow-y-auto p-1">
              {matches.map(({ countryId, name }) => (
                <button
                  key={countryId ?? "world"}
                  type="button"
                  aria-pressed={selected?.countryId === countryId}
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-plate px-2 py-1.5 text-left text-xs text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 aria-pressed:text-game-accent-100",
                    focusRing,
                  )}
                  onClick={() => {
                    onChange(countryId);
                    close();
                  }}
                >
                  {name}
                  {selected?.countryId === countryId && (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-game-accent-300"
                    />
                  )}
                </button>
              ))}
              {!matches.length && (
                <p className="p-2 text-xs text-game-ink-500">No countries match your search.</p>
              )}
            </div>
          );
        }}
      </HistorySearchPicker>
    </div>
  );
}
