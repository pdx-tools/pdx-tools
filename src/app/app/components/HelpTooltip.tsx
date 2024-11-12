import React from "react";
import { IconButton } from "./IconButton";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

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
      icon={
        <QuestionMarkCircleIcon className="h-4 w-4 cursor-help text-gray-500" />
      }
      tooltip={help}
    />
  );
};
