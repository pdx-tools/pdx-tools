import React, { useId } from "react";
import { Switch } from "antd";
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
  const id = useId();
  return (
    <div className="flex gap-4">
      <Switch
        className="peer"
        disabled={disabled}
        id={id}
        checked={value}
        onChange={onChange}
      />
      <label
        htmlFor={id}
        className="cursor-pointer select-none peer-disabled:cursor-not-allowed peer-disabled:text-gray-400"
      >
        {text}
      </label>
      {help && (
        <span className="ml-1">
          <HelpTooltip help={help} />
        </span>
      )}
    </div>
  );
};
