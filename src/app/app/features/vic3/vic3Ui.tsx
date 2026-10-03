import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { cx } from "class-variance-authority";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  HomeIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { getVic3Worker } from "./worker";
import { CountryStatsTable } from "./CountryStats";
import { CountryMarketTable } from "./CountryMarket";
import { CountryGDPChart } from "./CountryChart";
import { CountrySelect } from "./components/CountrySelect";
import { MeltButton } from "@/components/MeltButton";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { VisualizationProvider } from "@/components/viz";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEngineActions } from "@/features/engine";
import {
  Vic3StoreProvider,
  useLoadVic3,
  useSaveFilename,
  useSelectedTag,
  useVic3Actions,
  useVic3Meta,
} from "./store";
import type { Vic3SaveInput } from "./store";
import { useVic3Worker } from "./worker/useVic3Worker";
import { ExportDataButton } from "./ExportDataButton";
import { getVic3MapSession } from "./map/session";
import type { Vic3MapSession, Vic3MapSnapshot } from "./map/session";
import { ProvinceTooltip } from "./map/ProvinceTooltip";
import type { CountryDisplay } from "./worker/types";

export const Vic3Ui = (props: { save: Vic3SaveInput }) => {
  const save = props.save;
  const session = useMemo(() => getVic3MapSession(save), [save]);
  const map = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { data, error } = useLoadVic3(save);
  const { canvasRef, surfaceRef, focus } = useCanvasCourierSurface({ controller: session });
  const cursorRef = useCursorPosition(surfaceRef);

  useEffect(() => {
    if (data !== null) {
      session.setSave(data.getState().save.meta);
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
        <Vic3StoreProvider store={data}>
          <Vic3Panel session={session} map={map} />
        </Vic3StoreProvider>
      ) : null}
    </div>
  );
};

/** The tooltip of the province under the cursor */
function HoveredProvinceTooltip({
  session,
  cursorRef,
}: {
  session: Vic3MapSession;
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
function MapStatus({ status }: { status: Vic3MapSnapshot["status"] }) {
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

function Vic3Panel({ session, map }: { session: Vic3MapSession; map: Vic3MapSnapshot }) {
  const meta = useVic3Meta();
  const filename = useSaveFilename();
  const selected = useSelectedTag();
  const { selectCountry } = useVic3Actions();
  const { resetSaveAnalysis } = useEngineActions();
  const [open, setOpen] = useState(true);
  const mapReady = map.status.kind === "ready";
  useDocumentTitle(`${filename.replace(".v3", "")} - Vic3 (${meta.date}) - PDX Tools`);

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
      void session.highlightCountry(selected);
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
    <aside className="absolute top-4 bottom-4 left-4 flex w-[36rem] max-w-[calc(100%-2rem)] flex-col rounded-lg border border-black/10 bg-white/95 text-slate-900 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-100">
      <header className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <Button asChild variant="ghost" shape="square">
          <Link to="/" onClick={resetSaveAnalysis} aria-label="Return to home">
            <HomeIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{filename}</h2>
          <p className="text-xs opacity-70">Vic3 · {meta.date}</p>
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
        <div className="flex flex-wrap items-center gap-2">
          {meta.isMeltable ? (
            <MeltButton game="vic3" worker={getVic3Worker()} filename={filename} />
          ) : null}
          <ExportDataButton />
        </div>
        <CountryDetails
          landed={map.countries}
          onShowOnMap={mapReady ? (tag) => void session.centerOnCountry(tag) : undefined}
        />
      </div>
    </aside>
  );
}

type CountryDetailsProps = {
  /** Countries that own land on the map */
  landed: CountryDisplay[];
  /** Center the map on the country. Absent when the map is not available. */
  onShowOnMap?: (tag: string) => void;
};

function CountryDetails({ landed, onShowOnMap }: CountryDetailsProps) {
  const meta = useVic3Meta();
  const selected = useSelectedTag();
  const { selectCountry } = useVic3Actions();
  const selectedCountry = landed.find((x) => x.tag === selected);

  const { data: stats } = useVic3Worker(
    useCallback((worker) => worker.get_country_stats(selected), [selected]),
  );
  const { data: prices } = useVic3Worker(
    useCallback((worker) => worker.get_country_goods_prices(selected), [selected]),
  );

  const isSelected = useCallback((tag: string) => tag == selected, [selected]);
  const onSelect = useCallback(
    (tag: string) => {
      selectCountry(tag);
      return false;
    },
    [selectCountry],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <CountrySelect
          isSelected={isSelected}
          countries={meta.availableTags}
          landed={landed}
          onSelect={onSelect}
        >
          <span className="truncate">{selectedCountry?.name ?? selected}</span>
        </CountrySelect>
        {onShowOnMap && selectedCountry ? (
          <Button
            shape="square"
            aria-label="Show on map"
            title="Show on map"
            onClick={() => onShowOnMap(selectedCountry.tag)}
          >
            <MapPinIcon className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <VisualizationProvider>
        <div>
          <span>GDP/c</span>
          <CountryGDPChart type="gdpc" stats={stats?.data ?? []} />
        </div>
        <div>
          <span>GDP (M)</span>
          <CountryGDPChart type="gdp" stats={stats?.data ?? []} />
        </div>
      </VisualizationProvider>
      <div className="overflow-x-auto">
        <CountryStatsTable stats={stats?.data ?? []} />
      </div>
      <div>
        <span>Estimated prices in market</span>
        <CountryMarketTable goods_prices={prices?.prices ?? []} />
      </div>
    </div>
  );
}

export default Vic3Ui;
