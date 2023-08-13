import React from "react";
import { Button, ButtonProps } from "./Button";
import { Tooltip } from "./Tooltip";

type IconButtonProps = ButtonProps & {
  tooltip: string;
  icon: React.ReactNode;
};

export const IconButton = ({ tooltip, icon, ...rest }: IconButtonProps) => {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button {...rest}>{icon}</Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  );
};
