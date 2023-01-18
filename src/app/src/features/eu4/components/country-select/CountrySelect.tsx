import React, { useState } from "react";
import { Select } from "antd";
import { RefSelectProps } from "antd/lib/select";
import { useAppSelector } from "@/lib/store";
import { CountrySelectOption } from "./CountrySelectOption";
import {
  selectEu4HumanCountries,
  selectEu4AliveAICountries,
  selectEu4AICountries,
} from "../../eu4Slice";

const { OptGroup } = Select;

type CountryFilterSelectProps = React.ComponentProps<typeof Select> & {
  ai: "all" | "alive";
};

export const CountrySelect = React.forwardRef<
  RefSelectProps,
  CountryFilterSelectProps
>(({ open, ai, ...rest }, ref): JSX.Element => {
  const humanCountries = useAppSelector(selectEu4HumanCountries);
  const aliveAICountries = useAppSelector(selectEu4AliveAICountries);
  const aiCountries = useAppSelector(selectEu4AICountries);
  const [isOpen, setIsOpen] = useState(open);

  const players = humanCountries.map(CountrySelectOption);
  const otherCountries = ai == "alive" ? aliveAICountries : aiCountries;
  const others = otherCountries.map(CountrySelectOption);

  return (
    <Select
      showSearch
      optionFilterProp="label"
      open={isOpen}
      ref={ref}
      filterOption={(input, option) => {
        const label = option?.options?.[0]?.searchlabel || option?.searchlabel;
        if (typeof label === "string") {
          return label.indexOf(input.toLowerCase()) !== -1;
        } else {
          return false;
        }
      }}
      onDropdownVisibleChange={setIsOpen}
      {...rest}
    >
      <OptGroup label="Players">{players}</OptGroup>
      <OptGroup label="Others">{others}</OptGroup>
    </Select>
  );
});
