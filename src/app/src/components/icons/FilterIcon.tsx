import { SearchOutlined } from "@ant-design/icons";

interface FilterIconProps {
  filtered: boolean;
}

export const FilterIcon = ({ filtered }: FilterIconProps) => {
  return <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />;
};
