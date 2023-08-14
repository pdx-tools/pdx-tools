import React, { useMemo } from "react";
import { throttle } from "map";
import {
  useEu4Actions,
  useEu4Meta,
  useIsDatePickerEnabled,
  useSelectedDate,
} from "../../store";
import { Slider } from "@/components/Slider";
import { Input } from "@/components/Input";

export const DateTimeline = () => {
  const meta = useEu4Meta();
  const mapDate = useSelectedDate();
  const datePickerEnabled = useIsDatePickerEnabled();
  const { setSelectedDateDay, setSelectedDateText } = useEu4Actions();

  const dayChange = useMemo(
    () => throttle(setSelectedDateDay, 100),
    [setSelectedDateDay],
  );

  return (
    <div className="flex gap-4">
      <label className="flex w-36 basis-5/12 items-center gap-2">
        Date:
        <Input
          value={mapDate.text}
          disabled={!datePickerEnabled}
          maxLength={10}
          onChange={(e) => setSelectedDateText(e.target.value)}
        />
      </label>

      <Slider
        value={[mapDate.days]}
        disabled={!datePickerEnabled}
        max={meta.total_days}
        onValueChange={(v) => dayChange(v[0])}
        className="basis-7/12"
      />
    </div>
  );
};
