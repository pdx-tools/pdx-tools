import React from "react";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

interface HelpTooltipProps {
  help: string;
}

export const HelpTooltip = ({ help }: HelpTooltipProps) => {
  return (
    <Tooltip title={help}>
      <QuestionCircleOutlined className="cursor-help text-gray-500" />
    </Tooltip>
  );
};
