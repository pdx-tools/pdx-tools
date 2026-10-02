import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { cx } from "class-variance-authority";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";
import { getHoi4Worker } from "./worker";
import { MeltButton } from "@/components/MeltButton";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEngineActions } from "@/features/engine";
import { CountryDetails } from "./CountryDetails";
import { Hoi4StoreProvider, hoi4, useLoadHoi4 } from "./store";
import { getHoi4MapSession } from "./map/session";
import type { Hoi4MapSession, Hoi4MapSnapshot } from "./map/session";
import { ProvinceTooltip } from "./map/ProvinceTooltip";

type Hoi4SaveFile = { save: { file: File } };

export const Hoi4Ui = (props: Hoi4SaveFile) => {
  const file = props.save.file;
  const session = useMemo(() => getHoi4MapSession(file), [file]);
  const map = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { data, error } = useLoadHoi4(file);
  const { canvasRef, surfaceRef, focus } = useCanvasCourierSurface({ controller: session });
  const cursorRef = useCursorPosition(surfaceRef);

  useEffect(() => {
    if (data !== null) {
      session.setSave(data.getState().meta);
    }
  }, [data, session]);

  useEffect(() => {
    if (map.status.kind === "ready") {
      focus();
    }
  }, [focus, map.status.kind]);

  const mapUnavailable = map.status.kind === "unavailable";

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-700">
      <div
        ref={surfaceRef}
        className={cx("absolute inset-0 overflow-hidden", mapUnavailable && "invisible")}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none outline-none"
          width={600}
          height={400}
          tabIndex={0}
        />
      </div>

      <MapStatus status={map.status} />
      <HoveredProvinceTooltip session={session} cursorRef={cursorRef} />

      {error ? (
        <div className="absolute top-4 left-1/2 max-w-prose -translate-x-1/2">
          <Alert variant="error" className="px-4 py-2">
            <Alert.Description>{getErrorMessage(error)}</Alert.Description>
          </Alert>
        </div>
      ) : null}

      {data ? (
        <Hoi4StoreProvider store={data}>
          <Hoi4Panel session={session} map={map} />
        </Hoi4StoreProvider>
      ) : null}
    </div>
  );
};

/** The tooltip of the province under the cursor */
function HoveredProvinceTooltip({
  session,
  cursorRef,
}: {
  session: Hoi4MapSession;
  cursorRef: ReturnType<typeof useCursorPosition>;
}) {
  const hovered = useSyncExternalStore(
    session.subscribeHover,
    session.getHovered,
    session.getHovered,
  );
  return <ProvinceTooltip cursorRef={cursorRef} province={hovered} />;
}

/** A notice over the map area while the map loads or when it cannot load */
function MapStatus({ status }: { status: Hoi4MapSnapshot["status"] }) {
  if (status.kind === "ready") {
    return null;
  }

  const message =
    status.kind === "unavailable" ? `The map is not available: ${status.reason}` : "Loading map…";

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 max-w-md rounded-md bg-slate-900/80 px-3 py-2 text-sm text-slate-100 shadow">
      {message}
    </div>
  );
}

function Hoi4Panel({ session, map }: { session: Hoi4MapSession; map: Hoi4MapSnapshot }) {
  const meta = hoi4.useMeta();
  const saveFile = hoi4.useSaveInput();
  const selected = hoi4.useSelectedTag();
  const { selectCountry } = hoi4.useActions();
  const { resetSaveAnalysis } = useEngineActions();
  const [open, setOpen] = useState(true);
  const mapReady = map.status.kind === "ready";
  useDocumentTitle(`${saveFile.name.replace(".hoi4", "")} - Hoi4 (${meta.date}) - PDX Tools`);

  useEffect(
    () =>
      session.listenForCountryClicks((tag) => {
        selectCountry(tag);
        setOpen(true);
      }),
    [session, selectCountry],
  );

  useEffect(() => {
    if (mapReady) {
      void session.highlightCountry(selected ?? null);
    }
  }, [session, selected, mapReady]);

  if (!open) {
    return (
      <div className="absolute top-4 left-4">
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2 shadow-lg">
          <ChevronDoubleRightIcon className="h-4 w-4" />
          Save details
        </Button>
      </div>
    );
  }

  return (
    <aside className="absolute top-4 bottom-4 left-4 flex w-[28rem] max-w-[calc(100%-2rem)] flex-col rounded-lg border border-black/10 bg-white/95 text-slate-900 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-100">
      <header className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <Button asChild variant="ghost" shape="square">
          <Link to="/" onClick={resetSaveAnalysis} aria-label="Return to home">
            <HomeIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{saveFile.name}</h2>
          <p className="text-xs opacity-70">Hoi4 · {meta.date}</p>
        </div>
        <Button
          variant="ghost"
          shape="square"
          aria-label="Hide save details"
          onClick={() => setOpen(false)}
        >
          <ChevronDoubleLeftIcon className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {meta.isMeltable ? (
          <MeltButton game="hoi4" worker={getHoi4Worker()} filename={saveFile.name} />
        ) : null}
        <CountryDetails
          landed={map.countries}
          onShowOnMap={mapReady ? (tag) => void session.centerOnCountry(tag) : undefined}
        />
      </div>
    </aside>
  );
}

export default Hoi4Ui;
