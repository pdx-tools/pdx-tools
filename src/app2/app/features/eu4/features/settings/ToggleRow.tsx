import React, { useId } from "react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Switch } from "@/components/Switch";

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
    <div className="flex">
      <div className="flex gap-4">
        <Switch
          className="peer"
          disabled={disabled}
          id={id}
          checked={value}
          onCheckedChange={onChange}
        />
        <label
          htmlFor={id}
          className="cursor-pointer select-none peer-disabled:cursor-not-allowed peer-disabled:text-gray-400"
        >
          {text}
        </label>
      </div>
      {help && <HelpTooltip className="ml-1" help={help} />}
    </div>
  );
};
