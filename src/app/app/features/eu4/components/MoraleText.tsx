import { Tooltip } from "@/components/Tooltip";
import { formatFloat } from "@/lib/format";

export const MoraleText = ({ value }: { value?: number }) => {
  if (value !== undefined) {
    return formatFloat(value, 2);
  }

  return (
    <Tooltip>
      <Tooltip.Trigger>---</Tooltip.Trigger>
      <Tooltip.Content>Morale obscured by maintenance</Tooltip.Content>
    </Tooltip>
  );
};
