import { useCallback, useMemo } from "react";
import { MapPinIcon } from "@heroicons/react/24/outline";
import { CountrySelect } from "./components/CountrySelect";
import { hoi4 } from "./store";
import { useHoi4Worker } from "./hooks/useHoi4Worker";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import type { CountryDisplay } from "./worker/types";

type CountryDetailsProps = {
  /** Countries that own land on the map */
  landed: CountryDisplay[];
  /** Center the map on the country. Absent when the map is not available. */
  onShowOnMap?: (tag: string) => void;
};

export const CountryDetails = ({ landed, onShowOnMap }: CountryDetailsProps) => {
  const meta = hoi4.useMeta();
  const selected = hoi4.useSelectedTag();
  const { selectCountry } = hoi4.useActions();
  const selectedCountry = landed.find((x) => x.tag === selected);

  const { data, error } = useHoi4Worker(
    useCallback(
      async (worker) => {
        if (!selected) {
          return undefined;
        }

        return worker.countryDetails(selected);
      },
      [selected],
    ),
  );

  const isSelected = useCallback((tag: string) => tag == selected, [selected]);
  const onSelect = useCallback(
    (tag: string) => {
      selectCountry(tag);
      return false;
    },
    [selectCountry],
  );

  const details = useMemo(
    () =>
      data
        ? JSON.stringify(
            {
              ...data,
              variableCategories: Object.fromEntries(
                [...data.variableCategories.entries()]
                  .map(([k, v]) => [k, v.map((x) => +x.toFixed(3))])
                  .sort(),
              ),
              variables: Object.fromEntries(
                [...data.variables.entries()].map(([k, v]) => [k, +v.toFixed(3)]).sort(),
              ),
            },
            null,
            2,
          )
        : null,
    [data],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CountrySelect
          isSelected={isSelected}
          countries={meta.countries}
          landed={landed}
          onSelect={onSelect}
        >
          <span className="truncate">{selectedCountry?.name ?? selected}</span>
        </CountrySelect>
        {onShowOnMap && selectedCountry ? (
          <Button
            shape="square"
            aria-label="Show on map"
            title="Show on map"
            onClick={() => onShowOnMap(selectedCountry.tag)}
          >
            <MapPinIcon className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <Alert.Error msg={error} />
      {details !== null ? <pre className="overflow-x-auto text-xs">{details}</pre> : null}
    </div>
  );
};
