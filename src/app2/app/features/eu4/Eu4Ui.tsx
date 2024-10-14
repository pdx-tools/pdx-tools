import { useEffect, forwardRef, memo } from "react";
import { Eu4CanvasOverlay } from "./Eu4CanvasOverlay";
import { AppLoading } from "@/components/AppLoading";
import { ProgressBar } from "@/components/ProgressBar";
import { developerLog } from "@/lib/log";
import { Eu4SaveInput, useLoadEu4, Eu4StoreProvider } from "./store";
import { BrowserCheck } from "@/components/landing/BrowserCheck";
import { Alert } from "@/components/Alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { MapTip } from "./features/map/MapTip";
import { Timelapse } from "./features/settings/Timelapse";

type Eu4UiProps = {
  save: Eu4SaveInput;
};

const TrackingCanvas = memo(
  forwardRef<HTMLCanvasElement>(function TrackingCanvas({}, ref) {
    useEffect(() => {
      return () => {
        developerLog("tracking canvas unmounted");
      };
    });

    // Need touch-none for pointermove events to work
    // ref: https://stackoverflow.com/a/48254578/433785
    return <canvas className="touch-none" ref={ref} />;
  }),
);

export const Eu4Ui = ({ save }: Eu4UiProps) => {
  const { loading, data, error, mapCanvas, mapContainer } = useLoadEu4(save);

  const loadingIcon =
    data === null ? (
      <div className="absolute inset-0">
        <AppLoading />
      </div>
    ) : null;

  return (
    <>
      {loadingIcon}

      {data !== null ? (
        <div className="absolute inset-0 bg-slate-900"></div>
      ) : null}

      <div
        className="absolute inset-0 right-14 overflow-hidden rounded-tr-3xl"
        ref={mapContainer}
      >
        <TrackingCanvas ref={mapCanvas} />
      </div>

      {data !== null ? (
        <Eu4StoreProvider store={data}>
          <div className="fixed bottom-0 left-0 flex w-[calc(100%-56px)] items-end text-white">
            <Timelapse />
          </div>

          <div className="group absolute bottom-0 right-0 top-0 w-14 bg-slate-900 transition-[width] duration-150 hover:w-64 hover:shadow-lg hover:shadow-slate-500">
            <Eu4CanvasOverlay />
          </div>

          <MapTip />
        </Eu4StoreProvider>
      ) : null}

      <div className="absolute w-full">
        {loading !== null ? (
          <ProgressBar height={32} value={loading.percent ?? 0} />
        ) : null}
        {error !== null ? (
          <Alert className="px-2 py-4" variant="error">
            <Alert.Description>{getErrorMessage(error)}</Alert.Description>
          </Alert>
        ) : null}
        <BrowserCheck />
      </div>
    </>
  );
};

export default memo(Eu4Ui);
