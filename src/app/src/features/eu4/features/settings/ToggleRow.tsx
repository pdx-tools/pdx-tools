import React from "react";
import { Col, Row, Switch } from "antd";

export interface ToggleRowProps {
  value: boolean;
  onChange: (value: boolean) => void;
  text: string;
  disabled?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
  value,
  onChange,
  text,
  disabled = false,
}) => {
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
      </Col>
    </Row>
  );
};
