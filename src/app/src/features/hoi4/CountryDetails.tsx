import { useCallback, useState } from "react";
import { CountrySelect } from "./components/CountrySelect";
import { hoi4 } from "./store";
import { useHoi4Worker } from "./hooks/useHoi4Worker";
import { Alert } from "@/components/Alert";

export const CountryDetails = () => {
  const meta = hoi4.useMeta();
  const [selected, setSelected] = useState(meta.player);

  const { data, error } = useHoi4Worker(
    useCallback(async (worker) => worker.countryDetails(selected), [selected]),
  );

  return (
    <div>
      <CountrySelect
        isSelected={(x) => x == selected}
        countries={meta.countries}
        onSelect={(x) => {
          setSelected(x);
          return false;
        }}
      >
        {selected}
      </CountrySelect>
      <Alert.Error msg={error} />
      {data ? (
        <pre>
          {JSON.stringify(
            {
              ...data,
              variableCategories: Object.fromEntries(
                [...data.variableCategories.entries()]
                  .map(([k, v]) => [k, v.map((x) => +x.toFixed(3))])
                  .sort(),
              ),
              variables: Object.fromEntries(
                [...data.variables.entries()]
                  .map(([k, v]) => [k, +v.toFixed(3)])
                  .sort(),
              ),
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
};
