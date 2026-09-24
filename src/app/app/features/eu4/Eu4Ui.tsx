import { useEffect, forwardRef, memo } from "react";
import { Eu4CanvasOverlay } from "./Eu4CanvasOverlay";
import { AppLoading } from "@/components/AppLoading";
import { ProgressBar } from "@/components/ProgressBar";
import { SavePreviewUnderlay } from "@/components/SavePreviewUnderlay";
import { developerLog } from "@/lib/log";
import { useLoadEu4, Eu4StoreProvider } from "./store";
import type { Eu4SaveInput } from "./store";
import { BrowserCheck } from "@/components/landing/BrowserCheck";
import { Alert } from "@/components/Alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { ogImageUrl } from "@/lib/media";
import { Eu4CursorTooltip } from "./features/map/Eu4CursorTooltip";
import { TimelineBar } from "./features/timeline/TimelineBar";
import { GameThemeProvider } from "@/components/GameThemeProvider";

type Eu4UiProps = {
  save: Eu4SaveInput;
};

const TrackingCanvas = memo(
  forwardRef<HTMLCanvasElement>(function TrackingCanvas(_, ref) {
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
      save.kind === "server" ? (
        <div className="absolute inset-0">
          <SavePreviewUnderlay
            src={ogImageUrl(save.saveId)}
            groundClassName="text-white dark:text-slate-900"
          />
          <div className="relative h-full">
            <AppLoading />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <AppLoading />
        </div>
      )
    ) : null;

  return (
    <>
      {loadingIcon}

      {data !== null ? <div className="absolute inset-0 bg-slate-900"></div> : null}

      <div className="absolute inset-0 right-14 overflow-hidden rounded-tr-3xl" ref={mapContainer}>
        <TrackingCanvas ref={mapCanvas} />
      </div>

      {data !== null ? (
        <Eu4StoreProvider store={data}>
          <GameThemeProvider theme="eu4">
            <TimelineBar />
            <div className="group absolute top-0 right-0 bottom-0 w-14 bg-slate-900 transition-[width] duration-150 hover:w-64 hover:shadow-lg hover:shadow-slate-500">
              <Eu4CanvasOverlay />
            </div>
            <Eu4CursorTooltip />
          </GameThemeProvider>
        </Eu4StoreProvider>
      ) : null}

      <div className="absolute w-full">
        {loading !== null ? <ProgressBar height={32} value={loading.percent ?? 0} /> : null}
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
