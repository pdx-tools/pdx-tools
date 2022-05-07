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
        style={
          disabled
            ? {
                userSelect: "none",
                cursor: "not-allowed",
                color: "rgba(131, 131, 131, 0.85)",
              }
            : {
                userSelect: "none",
                cursor: "pointer",
              }
        }
        onClick={disabled ? () => {} : () => onChange(!value)}
      >
        {text}
        {help && (
          <span style={{ marginLeft: "4px" }}>
            <HelpTooltip help={help} />
          </span>
        )}
      </Col>
    </Row>
  );
};
