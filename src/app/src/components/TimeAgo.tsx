import React from "react";
import { Tooltip } from "antd";
import { display, timeAgo } from "@/lib/dates";

interface TimeAgoProps {
  date: string;
}

export const TimeAgo: React.FC<TimeAgoProps> = ({ date }) => {
  return (
    <Tooltip title={display(date)}>
      <span>{timeAgo(date)}</span>
    </Tooltip>
  );
};
