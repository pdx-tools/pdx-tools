import React, { useCallback, useState } from "react";
import { Button } from "antd";
import { CountryFilterForm } from "./CountryFilterForm";
import { CountrySelect } from "../../components/country-select";
import { Divider } from "@/components/Divider";
import { useEu4Actions, useTagFilter } from "../../store";
import { useEu4Worker } from "../../worker";

export const CountryFilterDrawerContent = () => {
  const [forceShowFiltered, setForceShowFiltered] = useState(false);
  const filter = useTagFilter();
  const { updateTagFilter } = useEu4Actions();
  const { data: countries = [] } = useEu4Worker(
    useCallback((worker) => worker.eu4MatchingCountries(filter), [filter])
  );

  const manySelectedTags = countries.length > 50;
  return (
    <>
      <Divider>{`Computed Selection (${countries.length})`}</Divider>
      <div className="h-40">
        {!forceShowFiltered && manySelectedTags && (
          <Button
            type="link"
            onClick={() => setForceShowFiltered(true)}
          >{`Show all ${countries.length} selected countries`}</Button>
        )}
        {(forceShowFiltered || !manySelectedTags) && (
          <CountrySelect
            ai="all"
            mode="multiple"
            value={countries.map((x) => x.tag)}
            allowClear
            className="max-h-40 w-full overflow-auto"
            onDeselect={(input: any) => {
              const tag = input as string;
              if (filter.exclude.indexOf(tag) === -1) {
                updateTagFilter({ exclude: [...filter.exclude, tag] });
              }
            }}
            onSelect={(input: any) => {
              const tag = input as string;
              if (filter.include.indexOf(tag) === -1) {
                updateTagFilter({ include: [...filter.include, tag] });
              }
            }}
          />
        )}
      </div>
      <Divider>Options</Divider>
      <CountryFilterForm />
    </>
  );
};
