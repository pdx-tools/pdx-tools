import React from "react";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { IconButton } from "./IconButton";

interface HelpTooltipProps {
  help: string;
  className?: string;
}

export const HelpTooltip = ({ help, className }: HelpTooltipProps) => {
  return (
    <IconButton
      shape="none"
      variant="ghost"
      className={className}
      icon={<QuestionCircleOutlined className="cursor-help text-gray-500" />}
      tooltip={help}
    />
  );
};
