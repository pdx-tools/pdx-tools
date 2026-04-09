import { memo, useEffect } from "react";
import { Eu5CanvasOverlay } from "./Eu5CanvasOverlay";
import { AppLoading } from "@/components/AppLoading";
import { developerLog } from "@/lib/log";
import { useLoadEu5, Eu5StoreProvider } from "./store";
import type { Eu5SaveInput } from "./store/types";
import { ProgressBar } from "@/components/ProgressBar";
import { Eu5HoverDisplay } from "./Eu5HoverDisplay";
import { Eu5ErrorDisplay } from "./Eu5ErrorDisplay";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";

type Eu5UiProps = {
  save: Eu5SaveInput;
};

export const Eu5Ui = ({ save }: Eu5UiProps) => {
  const { controller, data, error, loading } = useLoadEu5(save);
  const { canvasRef, surfaceRef, focus } = useCanvasCourierSurface({ controller });

  useEffect(() => {
    focus();
  }, [focus, controller]);

  useEffect(() => {
    if (error !== null) {
      developerLog(`Eu5 surface error: ${error}`);
    }
  }, [error]);

  return (
    <>
      {data === null && error === null ? (
        <div className="absolute inset-0">
          <AppLoading />
        </div>
      ) : null}

      {data !== null ? <div className="absolute inset-0 bg-slate-900"></div> : null}

      <div className="absolute inset-0 overflow-hidden" ref={surfaceRef}>
        <canvas
          className="h-full w-full touch-none outline-none"
          ref={canvasRef}
          width={600}
          height={400}
          tabIndex={0}
        />
      </div>

      {data !== null ? (
        <Eu5StoreProvider store={data}>
          <Eu5HoverDisplay />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-stretch justify-end p-6">
            <div className="pointer-events-auto h-full w-[22rem] max-w-full">
              <Eu5CanvasOverlay />
            </div>
          </div>
        </Eu5StoreProvider>
      ) : null}

      <div className="absolute w-full">
        {loading !== null ? <ProgressBar height={32} value={loading.percent ?? 0} /> : null}
        {error !== null ? <Eu5ErrorDisplay error={error} /> : null}
      </div>
    </>
  );
};

export default memo(Eu5Ui);
