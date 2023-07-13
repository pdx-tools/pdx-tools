import React from "react";
import { Drawer } from "antd";
import { CountryFilterDrawerContent } from "./CountryFilterDrawerContent";
import { HelpTooltip } from "@/components/HelpTooltip";

type CountryFilterDrawerProps = {
  visible: boolean;
  closeDrawer: () => void;
};

export const CountryFilterDrawer = ({
  visible,
  closeDrawer,
}: CountryFilterDrawerProps) => {
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
      <CountryFilterDrawerContent />
    </Drawer>
  );
};
