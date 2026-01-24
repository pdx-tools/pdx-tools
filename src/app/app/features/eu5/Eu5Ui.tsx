import { useEffect, forwardRef, memo } from "react";
import type { ForwardedRef } from "react";
import { Eu5CanvasOverlay } from "./Eu5CanvasOverlay";
import { AppLoading } from "@/components/AppLoading";
import { developerLog } from "@/lib/log";
import { useLoadEu5, Eu5StoreProvider } from "./store";
import type { Eu5SaveInput } from "./store/useLoadEu5";
import { CanvasEventHandler } from "./CanvasEventHandler";
import { ProgressBar } from "@/components/ProgressBar";
import { Eu5HoverDisplay } from "./Eu5HoverDisplay";
import { Eu5BrowserWarning } from "./Eu5BrowserWarning";
import { Eu5ErrorDisplay } from "./Eu5ErrorDisplay";

type Eu5UiProps = {
  save: Eu5SaveInput;
};

const TrackingCanvas = memo(
  forwardRef<HTMLCanvasElement>(function TrackingCanvas(
    _,
    ref: ForwardedRef<HTMLCanvasElement>,
  ) {
    useEffect(() => {
      return () => {
        developerLog("tracking canvas unmounted");
      };
    }, []);

    // Auto-focus canvas on mount so keyboard events work immediately
    useEffect(() => {
      if (typeof ref === "object") {
        ref?.current?.focus();
      }
    }, [ref]);

    // Need touch-none for pointermove events to work
    // ref: https://stackoverflow.com/a/48254578/433785
    return (
      <canvas
        className="h-full w-full touch-none outline-none"
        ref={ref}
        width={600}
        height={400}
        tabIndex={0}
      />
    );
  }),
);

export const Eu5Ui = ({ save }: Eu5UiProps) => {
  const { loading, data, error, mapCanvas, mapContainer } = useLoadEu5(save);

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

      <div className="absolute inset-0 overflow-hidden" ref={mapContainer}>
        <TrackingCanvas ref={mapCanvas} />
      </div>

      {data !== null ? (
        <Eu5StoreProvider store={data}>
          <CanvasEventHandler canvasRef={mapCanvas} />
          <Eu5HoverDisplay />
          <Eu5BrowserWarning />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-stretch justify-end p-6">
            <div className="pointer-events-auto h-full w-[22rem] max-w-full">
              <Eu5CanvasOverlay />
            </div>
          </div>
        </Eu5StoreProvider>
      ) : null}

      <div className="absolute w-full">
        {loading !== null ? (
          <ProgressBar height={32} value={loading.percent ?? 0} />
        ) : null}
        {error !== null ? <Eu5ErrorDisplay error={error} /> : null}
      </div>
    </>
  );
};

export default memo(Eu5Ui);
