import React from "react";
import { Drawer } from "antd";
import { CountryFilterDrawerContent } from "./CountryFilterDrawerContent";
import { CountryFilterProvider } from "./countryFilterContext";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useTagFilter } from "../../Eu4SaveProvider";

type CountryFilterDrawerProps = {
  visible: boolean;
  closeDrawer: () => void;
};

export const CountryFilterDrawer = ({
  visible,
  closeDrawer,
}: CountryFilterDrawerProps) => {
  const countryFilter = useTagFilter();

  return (
    <Drawer
      visible={visible}
      onClose={closeDrawer}
      width="min(800px, 100%)"
      title={
        <div className="flex gap-x-2">
          <span>Country Filter</span>
          <HelpTooltip help="Calculate the module with only the filtered countries selected" />
        </div>
      }
    >
      <CountryFilterProvider initialValues={countryFilter}>
        <CountryFilterDrawerContent closeDrawer={closeDrawer} />
      </CountryFilterProvider>
    </Drawer>
  );
};
