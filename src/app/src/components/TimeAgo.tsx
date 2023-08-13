import React from "react";
import { display, timeAgo } from "@/lib/dates";
import { Tooltip } from "./Tooltip";

interface TimeAgoProps {
  date: string;
}

export const TimeAgo = ({ date }: TimeAgoProps) => {
  return (
    <Tooltip>
      <Tooltip.Trigger>{timeAgo(date)}</Tooltip.Trigger>
      <Tooltip.Content>{display(date)}</Tooltip.Content>
    </Tooltip>
  );
};
