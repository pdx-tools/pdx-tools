import { useEffect, forwardRef, memo } from "react";
import { Eu4CanvasOverlay } from "./Eu4CanvasOverlay";
import { AppLoading } from "@/components/AppLoading";
import { ProgressBar } from "@/components/ProgressBar";
import { Alert } from "antd";
import { Eu4SaveProps, Eu4SaveProvider, useLoadEu4 } from "./Eu4SaveProvider";
import { useEngineActions } from "../engine";
import { developerLog } from "@/lib/log";

type Eu4UiProps = {
  save: Eu4SaveProps;
};

const TrackingCanvas = memo(
  forwardRef<HTMLCanvasElement>(function TrackingCanvas({}, ref) {
    useEffect(() => {
      return () => {
        developerLog("tracking canvas unmounted");
      };
    });

    return <canvas ref={ref} />;
  })
);

export const Eu4Ui = ({ save }: Eu4UiProps) => {
  const { loading, data, error, mapCanvas, mapContainer } = useLoadEu4(save);
  const { resetSaveAnalysis } = useEngineActions();
  useEffect(() => resetSaveAnalysis, [resetSaveAnalysis]);

  const loadingIcon =
    data === null ? (
      <div className="absolute inset-0">
        <AppLoading />
      </div>
    ) : null;

  const progress =
    error || loading ? (
      <div className="absolute w-full">
        {loading !== null ? (
          <ProgressBar height={32} value={loading.percent ?? 0} />
        ) : null}
        {error !== null ? (
          <Alert type="error" closable message={`${error}`} />
        ) : null}
      </div>
    ) : null;

  return (
    <>
      {loadingIcon}
      <div className="absolute inset-0" ref={mapContainer}>
        <TrackingCanvas ref={mapCanvas} />
      </div>
      {progress}
      {data !== null ? (
        <Eu4SaveProvider store={data}>
          <Eu4CanvasOverlay />
        </Eu4SaveProvider>
      ) : null}
    </>
  );
};

export default memo(Eu4Ui);
