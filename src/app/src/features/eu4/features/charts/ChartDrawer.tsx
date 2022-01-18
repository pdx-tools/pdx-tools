import React, { useState } from "react";
import { Drawer, Button, Select, Grid, Spin } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { useIsLoading } from "@/components/viz/visualization-context";
import { VizRenderer } from "./VizRenderer";
import { DisplayLimitAlert } from "./DisplayLimitAlert";
import { CountryFilterButton } from "@/features/eu4/features/country-filter";
import { VizModules } from "../../types/visualizations";
import { Help } from "./Help";
import { useSideBarContainerRef } from "../../components/SideBarContainer";

const { useBreakpoint } = Grid;
const { Option } = Select;

interface ChartDrawerProps {
  visible: boolean;
  closeDrawer: () => void;
}

const vizModuleDisplayLimit = (module: VizModules) => {
  switch (module) {
    case "monthly-income":
    case "score":
    case "nation-size":
    case "inflation":
    case "health":
      return 30;
    default:
      return null;
  }
};

export const ChartDrawer: React.FC<ChartDrawerProps> = ({
  visible,
  closeDrawer,
}) => {
  const defaultValue = "monthly-income";
  const [selectedViz, setSelectedViz] = useState<VizModules>(defaultValue);
  const [expanded, setExpanded] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const { md } = useBreakpoint();
  const isLoading = useIsLoading();
  const displayLimit = vizModuleDisplayLimit(selectedViz);
  const sideBarContainerRef = useSideBarContainerRef();

  return (
    <Drawer
      visible={visible}
      closable={true}
      mask={false}
      maskClosable={false}
      push={!helpVisible}
      onClose={closeDrawer}
      width={!expanded ? "min(800px, 100%)" : "100%"}
      title={
        <div className="flex-row gap">
          {md && (
            <Button
              icon={expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setExpanded(!expanded)}
            />
          )}

          <Select
            showSearch
            defaultValue={defaultValue}
            value={selectedViz}
            optionFilterProp="children"
            onChange={(e) => setSelectedViz(e)}
            style={{ width: 200 }}
            filterOption={(input, option) =>
              option?.value.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            <Select.OptGroup label="Annual Charts">
              <Option value="monthly-income">Monthly Income</Option>
              <Option value="nation-size">Nation Size</Option>
              <Option value="score">Score</Option>
              <Option value="inflation">Inflation</Option>
            </Select.OptGroup>
            <Select.OptGroup label="Tables">
              <Option value="army-casualties">Army Casualties</Option>
              <Option value="navy-casualties">Navy Casualties</Option>
              <Option value="wars">Wars and Battles</Option>

              <Option value="income-table">Last Month's Income</Option>
              <Option value="expense-table">Last Month's Expenses</Option>
              <Option value="total-expense-table">Accumulated Expenses</Option>
            </Select.OptGroup>
            <Select.OptGroup label="Other">
              <Option value="idea-group">Idea Groups Picked</Option>
              <Option value="health">Health Heatmap</Option>
            </Select.OptGroup>
          </Select>
          <CountryFilterButton />
          <Button
            onClick={() => setHelpVisible(true)}
            icon={<QuestionCircleOutlined />}
          />
          <Spin spinning={isLoading} />
        </div>
      }
    >
      <Drawer visible={helpVisible} onClose={() => setHelpVisible(false)}>
        <Help module={selectedViz} />
      </Drawer>

      <div
        className="flex-col gap"
        style={{ height: "100%" }}
        ref={sideBarContainerRef}
      >
        {displayLimit && <DisplayLimitAlert displayLimit={displayLimit} />}
        <VizRenderer module={selectedViz} />
      </div>
    </Drawer>
  );
};
