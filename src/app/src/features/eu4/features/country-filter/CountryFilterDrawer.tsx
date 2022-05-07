import React from "react";
import { useSelector } from "react-redux";
import { Drawer } from "antd";
import { CountryFilterDrawerContent } from "./CountryFilterDrawerContent";
import { CountryFilterProvider } from "./countryFilterContext";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { HelpTooltip } from "@/components/HelpTooltip";

interface CountryFilterDrawerProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const CountryFilterDrawer = ({
  visible,
  closeDrawer,
}: CountryFilterDrawerProps) => {
  const countryFilter = useSelector(selectEu4CountryFilter);

  return (
    <Drawer
      visible={visible}
      onClose={closeDrawer}
      width="min(800px, 100%)"
      title={
        <>
          <span style={{ paddingRight: "8px" }}>Country Filter</span>
          <HelpTooltip help="Calculate the module with only the filtered countries selected" />
        </>
      }
    >
      <CountryFilterProvider initialValues={countryFilter}>
        <CountryFilterDrawerContent closeDrawer={closeDrawer} />
      </CountryFilterProvider>
    </Drawer>
  );
};
