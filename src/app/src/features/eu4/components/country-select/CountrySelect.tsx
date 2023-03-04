import React, { useState } from "react";
import { Select } from "antd";
import { RefSelectProps } from "antd/lib/select";
import { CountrySelectOption } from "./CountrySelectOption";
import {
  useAiCountries,
  useAliveAiCountries,
  useHumanCountries,
} from "../../store";

const { OptGroup } = Select;

type CountryFilterSelectProps = React.ComponentProps<typeof Select> & {
  ai: "all" | "alive";
};

export const CountrySelect = React.forwardRef<
  RefSelectProps,
  CountryFilterSelectProps
>(({ open, ai, ...rest }, ref): JSX.Element => {
  const humanCountries = useHumanCountries();
  const aliveAiCountries = useAliveAiCountries();
  const aiCountries = useAiCountries();
  const [isOpen, setIsOpen] = useState(open);

  const players = humanCountries.map(CountrySelectOption);
  const otherCountries = ai == "alive" ? aliveAiCountries : aiCountries;
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
