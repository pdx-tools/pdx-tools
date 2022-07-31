import React from "react";
import { Col, Row, Switch } from "antd";
import { HelpTooltip } from "@/components/HelpTooltip";

export interface ToggleRowProps {
  value: boolean;
  onChange: (value: boolean) => void;
  text: string;
  disabled?: boolean;
  help?: string;
}

export const ToggleRow = ({
  value,
  onChange,
  text,
  disabled = false,
  help,
}: ToggleRowProps) => {
  const controlSpan = 4;
  const labelSpan = 24 - controlSpan;

  return (
    <Row>
      <Col span={controlSpan}>
        <Switch disabled={disabled} checked={value} onChange={onChange} />
      </Col>
      <Col
        aria-disabled={disabled}
        span={labelSpan}
        className={`select-none ${
          disabled ? "cursor-not-allowed text-gray-400" : "cursor-pointer"
        }`}
        onClick={disabled ? () => {} : () => onChange(!value)}
      >
        {text}
        {help && (
          <span className="ml-1">
            <HelpTooltip help={help} />
          </span>
        )}
      </Col>
    </Row>
  );
};
