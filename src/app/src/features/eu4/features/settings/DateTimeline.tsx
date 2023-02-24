import { Input, Slider } from "antd";
import React, { useMemo } from "react";
import { throttle } from "../../../../map/throttle";
import {
  useEu4Actions,
  useEu4Meta,
  useIsDatePickerEnabled,
  useSelectedDate,
} from "../../Eu4SaveProvider";

export const DateTimeline = () => {
  const meta = useEu4Meta();
  const mapDate = useSelectedDate();
  const datePickerEnabled = useIsDatePickerEnabled();
  const { setSelectedDateDay, setSelectedDateText } = useEu4Actions();

  const dayChange = useMemo(
    () => throttle(setSelectedDateDay, 100),
    [setSelectedDateDay]
  );

  return (
    <div className="flex flex-col gap-2">
      <label>
        Date:
        <Input
          value={mapDate.text}
          disabled={!datePickerEnabled}
          className="ml-2 w-32"
          maxLength={10}
          onChange={(e) => setSelectedDateText(e.target.value)}
        />
      </label>

      <Slider
        value={mapDate.days}
        disabled={!datePickerEnabled}
        max={meta.total_days}
        onChange={dayChange}
        className="grow select-none"
        tooltipVisible={false}
        marks={{
          0: {
            label: meta.start_date,
            style: {
              transform: "translateX(0%)",
              left: "0%",
              whiteSpace: "nowrap",
            },
          },
          [meta.total_days]: {
            label: meta.date,
            style: {
              transform: "translateX(-100%)",
              left: "100%",
              whiteSpace: "nowrap",
            },
          },
        }}
      />
    </div>
  );
};
