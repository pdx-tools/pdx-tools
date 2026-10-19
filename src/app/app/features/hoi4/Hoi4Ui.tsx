import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Link } from "react-router";
import { cx } from "class-variance-authority";
import "@fontsource/public-sans/latin-400.css";
import "@fontsource/public-sans/latin-500.css";
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-ext-400.css";
import "@fontsource/public-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import ArrowsPointingInIcon from "@heroicons/react/16/solid/ArrowsPointingInIcon";
import ArrowsPointingOutIcon from "@heroicons/react/16/solid/ArrowsPointingOutIcon";
import CameraIcon from "@heroicons/react/24/outline/CameraIcon";
import FireIcon from "@heroicons/react/24/solid/FireIcon";
import HomeIcon from "@heroicons/react/24/outline/HomeIcon";
import MapPinIcon from "@heroicons/react/24/outline/MapPinIcon";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { GameButton, GameSegmented } from "@/components/game";
import { footLabel, footRow } from "@/features/eu5/control-panel/footRow";
import { meltSave } from "@/components/MeltButton";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Tooltip } from "@/components/Tooltip";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { downloadData } from "@/lib/downloadData";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "@/lib/toast";
import { useCanvasCourierSurface } from "@/lib/canvas_courier";
import { useCursorPosition } from "@/hooks/useCursorPosition";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEngineActions } from "@/features/engine";
import {
  StackBody,
  StackCrumbs,
  StackHead,
  StackLayout,
  Swatch,
  TimeBar,
  deepest,
  formatDay,
} from "@/features/stack";
import type { LevelWidth } from "@/features/stack";
import { getHoi4Worker } from "./worker";
import { Hoi4StoreProvider, hoi4, useLoadHoi4 } from "./store";
import type { Hoi4Store } from "./store";
import { getHoi4MapSession } from "./map/session";
import type { Hoi4MapSession, Hoi4MapSnapshot } from "./map/session";
import { ProvinceTooltip } from "./map/ProvinceTooltip";
import { EVENT_KINDS, Hoi4World, MODES, entityKey, isWide } from "./view/model";
import type { Entity } from "./view/model";
import { Hoi4WorldContext, useWorld } from "./view/context";
import {
  ChronologyLevel,
  CountryLevel,
  EventLevel,
  GroupLevel,
  OccupationLevel,
  RootLevel,
} from "./view/levels";
import { CountryLedger, OccupationLedger, WarLedger } from "./view/ledgers";
import { PlaythroughLevel } from "./view/PlaythroughLevel";
import { VariablesLevel } from "./view/VariablesLevel";
import type { MapMode } from "./worker/types";

type Hoi4SaveFile = { save: { file: File } };

const SessionContext = createContext<Hoi4MapSession | null>(null);

export const Hoi4Ui = (props: Hoi4SaveFile) => {
  const file = props.save.file;
  const session = useMemo(() => getHoi4MapSession(file), [file]);
  const map = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { data: loaded, error } = useLoadHoi4(file);
  // Ignore the store of the previous save until the new save loads.
  const data = loaded?.getState().input === file ? loaded : null;
  const { surfaceRef, focus } = useCanvasCourierSurface(session.host);
  const cursorRef = useCursorPosition(surfaceRef);
  const world = useMemo(() => (map.overview ? new Hoi4World(map.overview) : null), [map.overview]);
  // The open level decides the width of the column. The column reports it,
  // so that the layout (and the canvas in it) never remounts.
  const [layout, setLayout] = React.useState<{ width: LevelWidth; expanded: boolean }>({
    width: "narrow",
    expanded: false,
  });

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

  const withSave = (children: React.ReactNode) =>
    data && world ? (
      <Hoi4StoreProvider store={data}>
        <SessionContext.Provider value={session}>
          <Hoi4WorldContext.Provider value={world}>{children}</Hoi4WorldContext.Provider>
        </SessionContext.Provider>
      </Hoi4StoreProvider>
    ) : null;

  return (
    <GameThemeProvider theme="hoi4">
      <StackLayout
        width={layout.width}
        expanded={layout.expanded}
        column={
          withSave(<Hoi4Column map={map} onLayout={setLayout} />) ?? (
            <WaitingColumn file={file} error={error} store={data} />
          )
        }
        map={
          <>
            <div
              ref={surfaceRef}
              className={cx(
                "absolute inset-0 overflow-hidden",
                map.status.kind === "unavailable" && "invisible",
              )}
            />
            <MapStatus status={map.status} version={data?.getState().meta.version ?? null} />
            {withSave(
              <>
                <MapSync session={session} map={map} />
                {layout.width === "wide" && layout.expanded ? null : <Hoi4TimeBar />}
                <HoveredProvinceTooltip session={session} cursorRef={cursorRef} />
              </>,
            )}
          </>
        }
      />
    </GameThemeProvider>
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

/** A notice over the map while it loads, or in its place when it cannot load */
function MapStatus({
  status,
  version,
}: {
  status: Hoi4MapSnapshot["status"];
  version: string | null;
}) {
  if (status.kind === "ready") {
    return null;
  }

  if (status.kind === "unavailable") {
    return (
      <div className="absolute inset-0 grid place-items-center bg-game-page p-6">
        <div className="grid max-w-[420px] gap-2 text-center">
          <p className="text-[15px] font-medium text-game-ink-100">The map is not available</p>
          <p className="text-[12.5px] leading-snug text-game-ink-500">{status.reason}</p>
          {version ? (
            <p className="font-game-num text-[11px] text-game-ink-500">Save written by {version}</p>
          ) : null}
          <p className="text-[12.5px] leading-snug text-game-ink-300">
            The column still reads the whole save, and Export still melts it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-[3] rounded-[var(--radius-panel)] border border-game-line-strong bg-game-overlay px-2.5 py-1.5 text-[12px] text-game-ink-300 shadow-[0_10px_15px_-3px_rgb(0_0_0/0.35)] backdrop-blur-md">
      Loading the map
    </div>
  );
}

/** Keeps the map in step with the column: the mode, the focus, and hover */
function MapSync({ session, map }: { session: Hoi4MapSession; map: Hoi4MapSnapshot }) {
  const world = useWorld();
  const mode = hoi4.useMode();
  const path = hoi4.usePath();
  const hover = hoi4.useHover();
  const { openPath, setHover } = hoi4.useActions();
  const ready = map.status.kind === "ready";
  // The map's hover listener outlives renders, so it reads the latest hover
  // from a ref.
  const hoverRef = useRef(hover);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);

  useEffect(() => {
    void session.setMode(mode);
  }, [session, mode, ready]);

  // The map lights the deepest level that is a place.
  const focus = useMemo(() => deepest(path, (e) => world.mapMatch(e)), [path, world]);
  useEffect(() => {
    void session.setMatch(focus, hover?.fromMap ? null : (hover?.match ?? null));
  }, [session, focus, hover, ready]);

  // A map click opens a new path: the mode's entity, then the country.
  useEffect(
    () =>
      session.listenForProvinceClicks((province) => {
        const controller = province.controller?.tag ?? province.owner?.tag;
        if (!controller) return;
        const entity = world.modeEntity(mode, controller, province.stateId ?? null);
        const country: Entity = { kind: "country", tag: controller };
        const occupier =
          entity?.kind === "occupation" ? world.overview.occupations[entity.index].occupier : null;
        const tail: Entity = occupier ? { kind: "country", tag: occupier } : country;
        openPath(entity && entity.kind !== "country" ? [entity, tail] : [tail]);
      }),
    [session, world, mode, openPath],
  );

  // Map hover lights the row of the land under the cursor.
  useEffect(
    () =>
      session.subscribeHover(() => {
        const province = session.getHovered();
        const controller = province?.controller?.tag ?? province?.owner?.tag;
        const entity = controller
          ? world.modeEntity(mode, controller, province?.stateId ?? null)
          : null;
        const current = hoverRef.current;
        if (entity) {
          setHover({ key: entityKey(entity), match: null, fromMap: true });
        } else if (current?.fromMap) {
          setHover(null);
        }
      }),
    [session, world, mode, setHover],
  );
  return null;
}

function Hoi4TimeBar() {
  const world = useWorld();
  const kinds = hoi4.useKinds();
  const path = hoi4.usePath();
  const { openPath, setHover } = hoi4.useActions();
  const events = useMemo(
    () => world.overview.events.filter((e) => kinds.has(e.kind)),
    [world, kinds],
  );
  const related = deepest(path, (e) => world.relatedTags(e));
  const top = path[path.length - 1];
  const openDate = top?.kind === "event" ? world.overview.events[top.index].date : null;

  return (
    <TimeBar
      start={world.overview.startDate}
      end={world.overview.date}
      events={events}
      isRelated={related ? (e) => e.countries.some((x) => related.has(x)) : null}
      openDate={openDate}
      describe={(e) => world.describe(e)}
      filterLabel={
        kinds.size === EVENT_KINDS.length
          ? "All kinds"
          : `${kinds.size} of ${EVENT_KINDS.length} kinds`
      }
      onOpenBin={(bin) => openPath([{ kind: "chronology", from: bin.from, to: bin.to }])}
      onHoverBin={(bin) =>
        setHover(
          bin
            ? {
                key: `bin:${bin.from}`,
                match: {
                  countries: [...new Set(bin.events.flatMap((e) => e.countries))],
                  states: [],
                },
              }
            : null,
        )
      }
    />
  );
}

/** The column before the save is read: the ground, the file, and progress */
function WaitingColumn({
  file,
  error,
  store,
}: {
  file: File;
  error: unknown;
  store: Hoi4Store | null;
}) {
  const { resetSaveAnalysis } = useEngineActions();
  return (
    <>
      <StackHead>
        <div className="flex items-center gap-2.5 border-b border-game-line px-3.5 py-3">
          <GameButton variant="icon" asChild>
            <Link to="/" onClick={resetSaveAnalysis} aria-label="Return to home">
              <HomeIcon className="h-4 w-4" />
            </Link>
          </GameButton>
          <div className="min-w-0 truncate text-[15px] leading-tight font-medium">{file.name}</div>
        </div>
      </StackHead>
      <StackBody>
        {error ? (
          <div className="grid gap-2 px-3.5 py-4">
            <p className="text-[13px] font-medium text-game-ink-100">This save could not be read</p>
            <p className="text-[12.5px] leading-snug text-game-ink-500">{getErrorMessage(error)}</p>
            <p className="text-[12.5px] leading-snug text-game-ink-300">
              Try a save from a newer patch, or ask on{" "}
              <a
                className="text-game-ink-100 underline decoration-game-ink-rule underline-offset-2 hover:decoration-game-ink-100"
                href="https://discord.gg/rCpNWQW"
              >
                Discord
              </a>{" "}
              or{" "}
              <a
                className="text-game-ink-100 underline decoration-game-ink-rule underline-offset-2 hover:decoration-game-ink-100"
                href="https://github.com/pdx-tools/pdx-tools/issues"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        ) : (
          <p className="px-3.5 py-4 text-[12.5px] text-game-ink-500">
            {store ? "Reading the game data for this patch." : "Parsing locally in your browser."}
          </p>
        )}
      </StackBody>
    </>
  );
}

function Hoi4Column({
  map,
  onLayout,
}: {
  map: Hoi4MapSnapshot;
  onLayout: (layout: { width: LevelWidth; expanded: boolean }) => void;
}) {
  const world = useWorld();
  const meta = hoi4.useMeta();
  const saveFile = hoi4.useSaveInput();
  const mode = hoi4.useMode();
  const path = hoi4.usePath();
  const expanded = hoi4.useExpanded();
  const { setMode, popTo, setExpanded } = hoi4.useActions();
  const { resetSaveAnalysis } = useEngineActions();
  const session = useContext(SessionContext);
  const bodyRef = useRef<HTMLDivElement>(null);
  const top = path[path.length - 1];
  const width: LevelWidth = top && isWide(top) ? "wide" : "narrow";
  const saveName = saveFile.name.replace(/\.hoi4$/, "");
  useDocumentTitle(`${saveName} - HOI4 (${meta.date}) - PDX Tools`);

  useEffect(
    () => onLayout({ width, expanded: width === "wide" && expanded }),
    [onLayout, width, expanded],
  );

  // A new level starts at its top.
  const pathKey = path.map(entityKey).join("/");
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [pathKey]);

  const player = meta.player ? world.byTag.get(meta.player) : null;
  const modeLabel = MODES.find((x) => x.key === mode)?.label ?? "Map";
  const rootIsClose = !!path[0] && !isModeEntity(path[0]);
  const mapReady = map.status.kind === "ready";

  return (
    <>
      <StackHead>
        <div className="flex items-center gap-2.5 border-b border-game-line px-3.5 py-3">
          <GameButton variant="icon" asChild>
            <Link to="/" onClick={resetSaveAnalysis} aria-label="Return to home">
              <HomeIcon className="h-4 w-4" />
            </Link>
          </GameButton>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] leading-tight font-medium">{saveName}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-game-ink-500">
              {player ? (
                <>
                  <Swatch color={player.color} size={10} />
                  <span className="truncate">{player.name}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="font-game-num text-game-ink-300 tabular-nums">
                {formatDay(world.overview.date)}
              </span>
            </div>
          </div>
        </div>
        <div className="px-3.5 py-2.5">
          <GameSegmented
            aria-label="Map mode"
            value={mode}
            onValueChange={(x) => setMode(x as MapMode)}
            className="grid w-full max-w-[312px] grid-cols-4"
          >
            {MODES.map((m) => (
              <GameSegmented.Item key={m.key} value={m.key} className="justify-center">
                {m.label}
              </GameSegmented.Item>
            ))}
          </GameSegmented>
        </div>
        {top ? (
          <StackCrumbs
            root={rootIsClose ? world.label(path[0]) : modeLabel}
            rootIsClose={rootIsClose}
            onRoot={() => popTo(0)}
            crumbs={path
              .slice(0, -1)
              .map((e, i) => ({ key: `${i}:${entityKey(e)}`, label: world.label(e) }))}
            onPop={(i) => popTo(i + 1)}
            here={world.label(top)}
            action={
              width === "wide" ? (
                <GameButton
                  variant="default"
                  className="h-6 gap-1 px-2 text-[12px]"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <ArrowsPointingInIcon aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowsPointingOutIcon aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {expanded ? "Collapse" : "Expand"}
                </GameButton>
              ) : top.kind === "country" && mapReady && session ? (
                <GameButton
                  variant="icon"
                  className="h-6 w-6"
                  aria-label="Show on map"
                  title="Show on map"
                  onClick={() => void session.centerOnCountry(top.tag)}
                >
                  <MapPinIcon className="h-3.5 w-3.5" />
                </GameButton>
              ) : null
            }
          />
        ) : (
          <div className="border-t border-game-line" />
        )}
      </StackHead>
      <StackBody ref={bodyRef}>
        {top ? <Level entity={top} /> : <RootLevel mode={mode} />}
      </StackBody>
      <ExportFoot mapReady={mapReady} meltable={meta.isMeltable} />
    </>
  );
}

/** The levels that a map mode lists. Others close back to the mode. */
function isModeEntity(e: Entity) {
  return (
    e.kind === "country" ||
    e.kind === "faction" ||
    e.kind === "ideology" ||
    e.kind === "occupation" ||
    e.kind === "event"
  );
}

function Level({ entity }: { entity: Entity }) {
  switch (entity.kind) {
    case "country":
      return <CountryLevel tag={entity.tag} />;
    case "faction":
    case "ideology":
      return <GroupLevel entity={entity} />;
    case "occupation":
      return <OccupationLevel index={entity.index} />;
    case "event":
      return <EventLevel index={entity.index} />;
    case "chronology":
      return <ChronologyLevel tag={entity.tag} from={entity.from} to={entity.to} />;
    case "playthrough":
      return <PlaythroughLevel tag={entity.tag} />;
    case "variables":
      return <VariablesLevel tag={entity.tag} />;
    case "countryLedger":
      return <CountryLedger />;
    case "memberLedger":
      return <CountryLedger faction={entity.index} />;
    case "occupationLedger":
      return <OccupationLedger />;
    case "warLedger":
      return <WarLedger tag={entity.tag} />;
  }
}

/** The actions that write a file: a screenshot of the map, and the melted save */
function ExportFoot({ mapReady, meltable }: { mapReady: boolean; meltable: boolean }) {
  const session = useContext(SessionContext);
  const saveFile = hoi4.useSaveInput();
  const mode = hoi4.useMode();
  const world = useWorld();
  const baseName = saveFile.name.replace(/\.hoi4$/, "");

  const screenshot = useTriggeredAction({
    action: async (fullResolution: boolean) => {
      try {
        if (!session) throw new Error("The map is not available");
        const blob = await session.screenshot(fullResolution);
        downloadData(blob, `${baseName}-${world.overview.date}-${mode}.png`);
        toast.success("Screenshot downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Screenshot error", { description: getErrorMessage(error), duration: 3000 });
        throw error;
      }
    },
  });

  const melt = useTriggeredAction({
    action: async () => {
      try {
        await meltSave("hoi4", saveFile.name, getHoi4Worker());
      } catch (error) {
        toast.error("Melt error", { description: getErrorMessage(error), duration: 3000 });
        throw error;
      }
    },
  });

  return (
    <div className={footRow}>
      <span className={footLabel}>Export</span>
      <FootButton
        label="Screenshot"
        hint={
          mapReady
            ? "Save the whole map as a PNG. Shift-click for double resolution."
            : "Available when the map has loaded"
        }
        icon={<CameraIcon className="h-4 w-4" />}
        loading={screenshot.isLoading}
        disabled={!mapReady}
        onClick={(e) => screenshot.run(e.shiftKey)}
      />
      {meltable ? (
        <FootButton
          label="Melt"
          hint="Convert the binary save to plaintext and download it."
          icon={<FireIcon className="h-4 w-4" />}
          loading={melt.isLoading}
          onClick={() => melt.run()}
        />
      ) : null}
    </div>
  );
}

function FootButton({
  label,
  hint,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        {/* A span keeps the hint reachable while the button is disabled. */}
        <span tabIndex={disabled ? 0 : undefined}>
          <GameButton
            variant="ghost"
            className="px-2"
            disabled={loading || disabled}
            onClick={onClick}
          >
            {loading ? <LoadingIcon className="h-4 w-4" /> : icon}
            {label}
          </GameButton>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="text-xs">
        {hint}
      </Tooltip.Content>
    </Tooltip>
  );
}

export default Hoi4Ui;
