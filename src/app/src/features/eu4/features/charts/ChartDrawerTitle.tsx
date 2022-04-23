import { useState } from "react";
import { Button, Grid, Select, Spin, Tooltip } from "antd";
import { useIsLoading, useVisualization } from "@/components/viz";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { VizModules } from "../../types/visualizations";
import { CountryFilterButton } from "../country-filter";
import { downloadData } from "@/lib/downloadData";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";

const { useBreakpoint } = Grid;
const { Option } = Select;

interface ChartDrawerTitleProps {
  selectedViz: VizModules;
  setSelectedViz: (arg: VizModules) => void;
  expanded: boolean;
  setExpanded: (arg: boolean) => void;
  onHelp: () => void;
}

export const ChartDrawerTitle: React.FC<ChartDrawerTitleProps> = ({
  selectedViz,
  setSelectedViz,
  expanded,
  setExpanded,
  onHelp,
}) => {
  const { md } = useBreakpoint();
  const isLoading = useIsLoading();
  const viz = useVisualization();
  const filename = useSelector(selectAnalyzeFileName);

  return (
    <div className="flex-row gap">
      {md && (
        <Button
          icon={expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setExpanded(!expanded)}
        />
      )}

      <Select
        showSearch
        value={selectedViz}
        onChange={(e: VizModules) => setSelectedViz(e)}
        style={{ width: 200 }}
        filterOption={(input, option) => {
          if (Array.isArray(option?.options)) {
            return false;
          }

          return option?.searchlabel?.toLowerCase().includes(input);
        }}
      >
        <Select.OptGroup label="Annual Charts">
          <Option value="monthly-income" searchlabel="Monthly Income">
            Monthly Income
          </Option>
          <Option value="nation-size" searchlabel="Nation Size">
            Nation Size
          </Option>
          <Option value="score" searchlabel="Score">
            Score
          </Option>
          <Option value="inflation" searchlabel="Inflation">
            Inflation
          </Option>
        </Select.OptGroup>
        <Select.OptGroup label="Tables">
          <Option value="army-casualties" searchlabel="Army Casualties">
            Army Casualties
          </Option>
          <Option value="navy-casualties" searchlabel="Navy Casualties">
            Navy Casualties
          </Option>
          <Option value="wars" searchlabel="Wars and Battles">
            Wars and Battles
          </Option>

          <Option value="income-table" searchlabel="Last Month Income">
            Last Month's Income
          </Option>
          <Option value="expense-table" searchlabel="Last Month Expenses">
            Last Month's Expenses
          </Option>
          <Option
            value="total-expense-table"
            searchlabel="Accumulated Expenses"
          >
            Accumulated Expenses
          </Option>
        </Select.OptGroup>
        <Select.OptGroup label="Other">
          <Option value="idea-group" searchlabel="Idea Groups Picked">
            Idea Groups Picked
          </Option>
          <Option value="health" searchlabel="Health Heatmap">
            Health Heatmap
          </Option>
        </Select.OptGroup>
      </Select>
      <CountryFilterButton />
      <Tooltip title="download data as csv">
        <Button
          icon={<ProfileOutlined />}
          onClick={async () => {
            const csvData = await viz.getCsvData();

            const nameInd = filename.lastIndexOf(".");
            const outputName =
              nameInd == -1
                ? `${filename}`
                : `${filename.substring(0, nameInd)}`;

            downloadData(
              new Blob([csvData], { type: "text/csv" }),
              `${outputName}-${selectedViz}.csv`
            );
          }}
        />
      </Tooltip>
      <Button onClick={onHelp} icon={<QuestionCircleOutlined />} />
      <Spin spinning={isLoading} />
    </div>
  );
};
