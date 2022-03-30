import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Radio } from "antd";
import { CaretRightOutlined, PauseOutlined } from "@ant-design/icons";
import { getWasmWorker, useWasmWorker } from "@/features/engine";
import { selectEu4MapDate, setMapDate, useEu4Meta } from "../../eu4Slice";
import { MapDate } from "../../types/models";

export const Timelapse: React.FC<{}> = () => {
  const dispatch = useDispatch();
  const meta = useEu4Meta();
  const workerRef = useWasmWorker();
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalSelection, setIntervalSelection] = useState<string>("Year");
  const currentMapDate = useSelector(selectEu4MapDate);
  const rafId = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  const timelapseClick = () => {
    if (isPlaying) {
      cancelAnimationFrame(rafId.current);
      setIsPlaying(false);
    } else {
      const startDate: MapDate =
        currentMapDate.days == meta.total_days
          ? {
              days: 0,
              text: meta.start_date,
            }
          : currentMapDate;

      setIsPlaying(true);
      const worker = getWasmWorker(workerRef);

      let lastTimestamp = 0;
      let date = startDate;
      const maxFps = 8;
      const timestep = 1000 / maxFps;

      const rafUpdate: FrameRequestCallback = async (timestamp) => {
        rafId.current = requestAnimationFrame(rafUpdate);

        if (timestamp - lastTimestamp < timestep) {
          return;
        }

        lastTimestamp = timestamp;

        dispatch(setMapDate(date));

        if (date.days == meta.total_days) {
          setIsPlaying(false);
          cancelAnimationFrame(rafId.current);
          return;
        }

        date = await worker.eu4IncrementDate(date.days, intervalSelection);

        if (date.days > meta.total_days) {
          date = {
            days: meta.total_days,
            text: meta.date,
          };
        }
      };
      rafId.current = requestAnimationFrame(rafUpdate);
    }
  };

  return (
    <>
      <div className="flex-row gap justify-center">
        <Radio.Group
          value={intervalSelection}
          onChange={(e) => setIntervalSelection(e.target.value)}
          optionType="button"
          options={[
            {
              label: "Year",
              value: "Year",
            },
            {
              label: "Month",
              value: "Month",
            },
            {
              label: "Week",
              value: "Week",
            },
            {
              label: "Day",
              value: "Day",
            },
          ]}
        />
        <Button
          shape="circle"
          icon={!isPlaying ? <CaretRightOutlined /> : <PauseOutlined />}
          onClick={timelapseClick}
        />
      </div>
    </>
  );
};
