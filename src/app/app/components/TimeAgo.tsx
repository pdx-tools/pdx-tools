import { display, timeAgo } from "@/lib/dates";
import { Tooltip } from "./Tooltip";

interface TimeAgoProps {
  date: string;
}

export const TimeAgo = ({ date }: TimeAgoProps) => {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        {/* The relative time can change between server render and hydration. */}
        <time dateTime={date} suppressHydrationWarning>
          {timeAgo(date)}
        </time>
      </Tooltip.Trigger>
      <Tooltip.Content>{display(date)}</Tooltip.Content>
    </Tooltip>
  );
};
