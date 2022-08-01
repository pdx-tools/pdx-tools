import { Input, Slider } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/lib/store";
import { throttle } from "../../../../map/throttle";
import {
  selectEu4MapColorPayload,
  selectEu4MapDate,
  selectEu4MapMode,
  setMapDate,
  useEu4Meta,
} from "@/features/eu4/eu4Slice";
import { getWasmWorker, useWasmWorker } from "@/features/engine";

export const DateTimeline = () => {
  const dispatch = useAppDispatch();
  const meta = useEu4Meta();
  const mapMode = useSelector(selectEu4MapMode);
  const controls = useSelector(selectEu4MapColorPayload);
  const workerRef = useWasmWorker();
  const mapDate = useSelector(selectEu4MapDate);
  const [localDate, setLocalDate] = useState(meta.date);
  const datePickerDisabled = mapMode !== "political" && mapMode !== "religion";
  const date = datePickerDisabled
    ? meta.total_days
    : controls.date ?? meta.total_days;

  const onDateChange = useMemo(
    () =>
      throttle(async (days: number) => {
        const text = await getWasmWorker(workerRef).eu4DaysToDate(days);
        dispatch(setMapDate({ days, text }));
      }, 100),
    [dispatch, workerRef]
  );

  const dateTextChange = async (e: string) => {
    setLocalDate(e);
    const worker = getWasmWorker(workerRef);
    const days = await worker.eu4DateToDays(e);
    if (days !== null) {
      dispatch(setMapDate({ days, text: e }));
    }
  };

  useEffect(() => {
    setLocalDate(mapDate.text);
  }, [mapDate.text]);

  return (
    <div className="flex flex-col gap-2">
      <label>
        Date:
        <Input
          value={localDate}
          disabled={datePickerDisabled}
          className="ml-2 w-32"
          maxLength={10}
          onChange={(e) => dateTextChange(e.target.value)}
        />
      </label>

      <Slider
        value={date}
        disabled={datePickerDisabled}
        max={meta.total_days}
        onChange={onDateChange}
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
