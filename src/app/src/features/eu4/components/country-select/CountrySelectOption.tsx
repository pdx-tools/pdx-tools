import React from "react";
import { Select } from "antd";
import { FlagAvatarCore } from "@/features/eu4/components/avatars";
import { EnhancedCountryInfo } from "@/features/eu4/types/models";
const { Option } = Select;

export const CountrySelectOption = ({
  tag,
  name,
  normalizedName,
}: Pick<EnhancedCountryInfo, "tag" | "name" | "normalizedName">) => {
  return (
    <Option
      key={tag}
      value={`${tag}`}
      label={`${tag} - ${name}`}
      searchlabel={`${tag} - ${name} - ${normalizedName}`.toLowerCase()}
    >
      <div className="flex items-center space-x-2">
        <FlagAvatarCore tag={tag} />
        <span>{`${tag} - ${name}`}</span>
      </div>
    </Option>
  );
};
