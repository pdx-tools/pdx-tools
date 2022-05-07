import React from "react";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import css from "styled-jsx/css";

const { className, styles } = css.resolve`
  span.anticon {
    color: rgba(0, 0, 0, 0.45);
    cursor: help;
  }
`;

interface HelpTooltipProps {
  help: string;
}

export const HelpTooltip = ({ help }: HelpTooltipProps) => {
  return (
    <Tooltip title={help}>
      <QuestionCircleOutlined className={className} />
      {styles}
    </Tooltip>
  );
};
