import React from "react";
import { Radio, Switch, Checkbox } from "antd";
import { CountrySelect } from "../../components/country-select";
import { CountryMatcher } from "../../types/models";
import { useEu4Actions, useTagFilter } from "../../store";

const superregions = [
  "india",
  "east_indies",
  "oceania",
  "china",
  "europe",
  "eastern_europe",
  "tartary",
  "far_east",
  "africa",
  "southern_africa",
  "south_america",
  "andes",
  "north_america",
  "central_america",
  "near_east",
  "persia_superregion",
];

const superregionOptions = () =>
  superregions.map((x) => {
    let value = `${x}_superregion`;
    let upper = x.charAt(0).toUpperCase() + x.slice(1);
    let label = upper.replace(/_/g, " ");
    return { label, value };
  });

export const CountryFilterForm = () => {
  const { updateTagFilter } = useEu4Actions();
  const filter = useTagFilter();

  const setM = (x: Partial<CountryMatcher>) => {
    updateTagFilter(x);
  };

  return (
    <form className="flex flex-col gap-4">
      <label>
        <div>Humans</div>
        <Radio.Group
          value={filter.players}
          onChange={(e) => setM({ players: e.target.value })}
          defaultValue={filter.players}
          options={[
            {
              label: "All",
              value: "all",
            },
            {
              label: "Alive",
              value: "alive",
            },
            {
              label: "Dead",
              value: "dead",
            },
            {
              label: "None",
              value: "none",
            },
          ]}
          optionType="button"
        />
      </label>

      <label>
        <div>AI</div>
        <Radio.Group
          value={filter.ai}
          onChange={(e) => setM({ ai: e.target.value })}
          options={[
            {
              label: "All",
              value: "all",
            },
            {
              label: "Alive",
              value: "alive",
            },
            {
              label: "Greats",
              value: "great",
            },
            {
              label: "Dead",
              value: "dead",
            },
            {
              label: "None",
              value: "none",
            },
          ]}
          optionType="button"
        />
      </label>

      <label>
        <div>Subcontinent</div>
        <Checkbox.Group
          value={filter.subcontinents}
          onChange={(e) => setM({ subcontinents: e as string[] })}
          options={superregionOptions()}
        ></Checkbox.Group>
      </label>

      <label>
        <div>Include</div>
        <CountrySelect
          value={filter.include}
          onChange={(e) => setM({ include: e as string[] })}
          ai="all"
          mode="multiple"
          className="w-full"
        />
      </label>

      <label>
        <div>Exclude</div>
        <CountrySelect
          value={filter.exclude}
          onChange={(e) => setM({ exclude: e as string[] })}
          ai="all"
          mode="multiple"
          className="w-full"
        />
      </label>
      <label className="flex gap-3">
        <span>Include Subjects</span>
        <Switch
          checked={filter.includeSubjects}
          onChange={(e) => setM({ includeSubjects: e })}
        />
      </label>
    </form>
  );
};
