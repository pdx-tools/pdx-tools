import React from "react";
import { Space, Select } from "antd";
import { FlagAvatarCore } from "@/features/eu4/components/avatars";
import { EnhancedCountryInfo } from "@/features/eu4/types/models";
const { Option } = Select;

export const CountrySelectOption: React.FC<
  Pick<EnhancedCountryInfo, "tag" | "name" | "normalizedName">
> = ({ tag, name, normalizedName }) => {
  return (
    <Option
      key={tag}
      value={`${tag}`}
      label={`${tag} - ${name}`}
      searchlabel={`${tag} - ${name} - ${normalizedName}`.toLowerCase()}
    >
      <Space>
        <FlagAvatarCore tag={tag} />
        <span>{`${tag} - ${name}`}</span>
      </Space>
    </Option>
  );
};
