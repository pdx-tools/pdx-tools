import React from "react";
import { ColumnType } from "antd/lib/table";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { RefSelectProps } from "antd/lib/select";
import { CountrySelect } from "../../components/country-select";

export function countryColumnFilter<T>(
  ref: React.MutableRefObject<RefSelectProps | null>,
  tagFn: (arg0: T) => string
): Partial<ColumnType<T>> {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, visible }) => {
      return (
        <div style={{ padding: 16 }}>
          <CountrySelect
            placeholder="filter to country"
            style={{ width: "250px" }}
            ref={ref}
            open={true}
            autoFocus={true}
            value={selectedKeys.map((x) => x.toString()) || []}
            onChange={(input: any) => {
              let tag: string = input;
              setSelectedKeys([tag]);
              confirm({ closeDropdown: false });
            }}
          />
        </div>
      );
    },
    filterIcon: (filtered) => <FilterIcon filtered={filtered} />,
    onFilter: (value: string | number | boolean, record: T) =>
      tagFn(record) == value,
    onFilterDropdownVisibleChange: (visible) => {
      if (visible) {
        // this timeout is from antd's own examples
        setTimeout(() => {
          ref.current?.focus();
        }, 100);
      } else {
        ref.current?.blur();
      }
    },
  };
}
