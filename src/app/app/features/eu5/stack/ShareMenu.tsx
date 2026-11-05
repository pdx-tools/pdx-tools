import { cx } from "class-variance-authority";
import { useEffect, useRef, useState } from "react";
import ArrowUpOnSquareIcon from "@heroicons/react/16/solid/ArrowUpOnSquareIcon";
import CheckIcon from "@heroicons/react/16/solid/CheckIcon";
import GlobeAltIcon from "@heroicons/react/24/outline/GlobeAltIcon";
import PhotoIcon from "@heroicons/react/24/outline/PhotoIcon";
import ClipboardDocumentIcon from "@heroicons/react/24/outline/ClipboardDocumentIcon";
import VideoCameraIcon from "@heroicons/react/24/outline/VideoCameraIcon";
import { GameButton } from "@/components/game/Button";
import { focusRing } from "@/components/game/focusRing";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Popover } from "@/components/Popover";
import { formatLongDate } from "@/features/timeline/date";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { downloadData } from "@/lib/downloadData";
import { formatCount, formatInt, formatMetric, formatTick } from "@/lib/format";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "@/lib/toast";
import { legendScaleTicks, paletteStops } from "../control-panel/Legend/GradientLegend";
import { ShareLinkItem } from "../control-panel/SaveMenu";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import { useMapHistory } from "../history/context";
import {
  useEu5Engine,
  useEu5HomeCountry,
  useEu5IsGeneratingScreenshot,
  useEu5MapMode,
  useEu5MapModeGradient,
  useEu5MapViewport,
  useEu5PaletteGradients,
  useEu5Players,
  useEu5SaveDate,
  useEu5SelectionState,
  useEu5CustomTitle,
  useSetEu5CustomTitle,
  useEu5Timeline,
  useEu5TimelineLive,
  useEu5TimelineMapDate,
} from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useViewportInsets } from "../useViewportInsets";
import type { ScreenshotCaption } from "../workers/map/map-module";
import { placeNames } from "./atlas";
import { useFrameSelection } from "./frameSelection";
import { useSelectedCountries } from "./selected";
import { composeStory } from "./storyImage";
import { landPoints, pastStoryRows, rowWithPlayer } from "./storyContent";
import type { StoryParts } from "./storyImage";
import { pointsToSave } from "./yearlySeries";
import { useFigure } from "./figure";
import { useMapNames, useRealmNames } from "./MapLabels";
import { rankFormatter, useRanking } from "./ModeRanking";
import { formatScore, landChapters } from "./selection";
import { useCampaignTitle } from "./HomeName";

/** About how much of the width of an image its caption takes, across and up */
const CAPTION_SHARE = { width: 0.42, height: 0.09 };

/** The modes whose key lists what the colours are */
const CATEGORY_MODES: ReadonlySet<string> = new Set(["religion", "markets"]);

/** What the map says now, as the on-screen caption and the image both say it */
function useCaptionFor(): (view: "this view" | "world") => ScreenshotCaption {
  const mapMode = useEu5MapMode();
  const liveDate = useEu5TimelineMapDate();
  const mapDate = useMapHistory()?.preview?.shown?.date ?? liveDate;
  const gradient = useEu5MapModeGradient();
  const palettes = useEu5PaletteGradients();
  const live = useEu5TimelineLive();
  const figure = useFigure();
  const viewport = useEu5MapViewport();
  const insets = useViewportInsets();
  const { names, worldWidth } = useRealmNames();
  const [namesShown] = useMapNames();
  const players = useEu5Players();
  const ranking = useRanking(mapMode);
  const board = useEu5SelectionTrigger(
    (engine) =>
      players.length > 1
        ? engine.queries.getPoliticalWorldScoreboard()
        : Promise.resolve(undefined),
    [players.length],
  ).data;
  return (view) => {
    const scale = gradient
      ? {
          label: figure.keyLabel,
          ticks: legendScaleTicks(mapMode, gradient).map((tick) => tick.label),
          stops: paletteStops(palettes[gradient.palette]),
        }
      : undefined;
    const base = {
      title: figure.title,
      subtitle: figure.subtitle,
      date: formatLongDate(mapDate),
      pastDate: !live,
      scale,
      keyLine: gradient ? undefined : figure.keyLabel,
      categories: CATEGORY_MODES.has(mapMode)
        ? (ranking?.rows ?? []).slice(0, 8).map((row) => ({ name: row.name, color: row.color }))
        : undefined,
      group: board
        ? {
            title: "Players by score",
            headers: ["Country", "Player", "Score", "Income"],
            rows: board.rows
              .filter((row) => row.country.isPlayer)
              .map((row) => [
                row.country.country.name,
                players.find((p) => p.countryIdx === row.country.country.key)?.name ?? "",
                formatScore(row.greatPowerPoints),
                formatInt(Math.round(row.income)),
              ]),
          }
        : undefined,
    };
    if (!viewport || worldWidth === null) return base;
    const world = viewport.world;
    // The image is what the map frame shows, without the part under the column.
    const full = view === "world";
    const frameWidth = window.innerWidth;
    const frameHeight = window.innerHeight;
    const coveredShare = full ? 0 : insets.left / frameWidth;
    const shown = full
      ? { x: 0, y: 0, width: world.width, height: world.height }
      : {
          x: viewport.viewport.x + viewport.viewport.width * coveredShare,
          y: viewport.viewport.y,
          width: viewport.viewport.width * (1 - coveredShare),
          height: viewport.viewport.height,
        };
    const reference = full
      ? { width: 2400, height: 1200 }
      : { width: frameWidth - insets.left, height: frameHeight };
    const category = CATEGORY_MODES.has(mapMode);
    const { placed } = namesShown
      ? placeNames(names, shown, worldWidth, reference, { left: 2, right: 2, top: 2, bottom: 2 }, [
          // The caption of the image stands in this corner.
          {
            x0: 0,
            y0: reference.height - reference.width * (category ? 0.17 : CAPTION_SHARE.height),
            x1: reference.width * CAPTION_SHARE.width,
            y1: reference.height,
          },
        ])
      : { placed: [] };
    // A view that leaves out the subject of the title says what is in it instead.
    const inFrame = full || !figure.leaderName || placed.some((n) => n.name === figure.leaderName);
    const largestHere = [...placed].sort((a, b) => b.size - a.size)[0]?.name;
    return {
      ...base,
      title: inFrame
        ? base.title
        : largestHere
          ? `${figure.modeLabel} map around ${largestHere}`
          : `${figure.modeLabel} map`,
      names: placed.map((name) => ({
        text: name.name,
        x: name.left / reference.width,
        y: name.top / reference.width,
        size: name.size / reference.width,
        angle: name.angle,
        capitals: name.capitals,
        anchor: name.anchor
          ? { x: name.anchor.left / reference.width, y: name.anchor.top / reference.width }
          : undefined,
      })),
      crop: full
        ? undefined
        : {
            x: (((shown.x % world.width) + world.width) % world.width) / world.width,
            y: Math.max(0, shown.y) / world.height,
            width: Math.min(1, shown.width / world.width),
            height: Math.min(1, shown.height / world.height),
          },
    };
  };
}

/** Long enough for the map to take a new frame */
const FRAME_SETTLE_MS = 500;

/** The rows and the lead chart of the story image, from what the column has */
function useStoryParts(): () => Promise<Pick<StoryParts, "rows" | "rowsTitle" | "chart">> {
  const engine = useEu5Engine();
  const mode = useEu5MapMode();
  const ranking = useRanking(mode);
  const saveDate = useEu5SaveDate();
  const home = useEu5HomeCountry();
  const selection = useEu5SelectionState();
  const countries = useSelectedCountries();
  const live = useEu5TimelineLive();
  const mapDate = useEu5TimelineMapDate();
  const players = useEu5Players();
  const playerOf = (idx: number | undefined) =>
    players.length > 1 ? players.find((p) => p.countryIdx === idx)?.name : undefined;
  return async () => {
    const entity = selection?.preset === "players" ? undefined : selection?.activeProfile;
    const rankedKeys = (ranking?.rows ?? []).flatMap((row) =>
      row.country ? [row.country.country.key] : [],
    );
    const picked =
      entity?.kind === "country"
        ? [entity.country.key]
        : // The chart has the first rows of the list beside it, so that the two agree.
          rankedKeys.length > 0
          ? rankedKeys.slice(0, 3).concat(home ? [home.countryIdx] : [])
          : countries.slice(0, 3).map((c) => c.country.key);
    const keys = [...new Set(picked)];
    const profiles = (
      await Promise.all(keys.map((idx) => engine.queries.getCountryProfile(idx)))
    ).filter((profile) => profile !== undefined && profile !== null);
    const histories = await Promise.all(keys.map((idx) => engine.queries.getLandHistory(idx)));
    const dated = live
      ? []
      : await Promise.all(keys.map((idx) => engine.queries.getDatedLand(idx)));
    const landSeries = profiles.flatMap((profile, i) => {
      const history = histories[i];
      if (!history) return [];
      const points = landPoints(history.points);
      // The figure of the map's date, from the same source as the title.
      const shownAt = live ? (points.at(-1)?.[1] ?? 0) : (dated[i]?.locations ?? 0);
      return [
        {
          name: profile.header.name,
          color: profile.header.colorHex,
          points,
          end: `${formatInt(shownAt)} locations`,
        },
      ];
    });
    const landChart: StoryParts["chart"] =
      landSeries.length > 0
        ? {
            title: live ? "Land by year" : `Land by year, to ${formatLongDate(mapDate)} and after`,
            series: landSeries,
            markYear: live ? undefined : mapDate.year,
            formatY: (y) => formatInt(Math.round(y)),
            notes:
              histories[0] && keys.length === 1
                ? landChapters(histories[0]).map((chapter) => ({
                    x: chapter.year,
                    text: chapter.text,
                  }))
                : undefined,
          }
        : undefined;

    // A past date has land only, because the save keeps all else for the save date.
    if (!live) {
      const realms = await engine.queries.getDatedRealms(keys[0]);
      return {
        rows: pastStoryRows(realms.rows.map((row) => ({ ...row, colorHex: row.colorHex }))),
        rowsTitle: `Locations on ${formatLongDate(mapDate)}`,
        chart: landChart,
      };
    }

    const format = ranking ? rankFormatter(ranking, mode) : (v: number) => String(v);
    const rows = (ranking?.rows ?? []).slice(0, 8).map((row) => ({
      name: rowWithPlayer(row.name, playerOf(row.country?.country.key)),
      color: row.color,
      shown: row.display ?? format(row.value),
    }));
    const rowsTitle = ranking ? `${ranking.noun}: ${ranking.unit}` : "";
    const population = mode === "population" || mode === "populationGrowth";
    const yearly = profiles.map((profile) => {
      const { overview, header } = profile;
      return {
        name: header.name,
        color: header.colorHex,
        points: population
          ? pointsToSave(overview.historicalPopulation, saveDate, overview.totalPopulation)
          : pointsToSave(overview.historicalTaxBase, saveDate, overview.taxBase),
        end: population ? formatCount(overview.totalPopulation) : formatMetric(overview.taxBase),
      };
    });
    const yearlyChart: StoryParts["chart"] =
      yearly.length > 0
        ? {
            title: population ? "Population by year" : "Tax base by year",
            series: yearly,
            formatY: formatTick,
          }
        : undefined;
    const taxModes = mode === "wealth" || mode === "unrealizedTaxBase";
    return {
      rows,
      rowsTitle,
      // The land of a campaign tells its story. A mode with its own yearly record has that.
      chart: population || taxModes ? yearlyChart : (landChart ?? yearlyChart),
    };
  };
}

/** How long the button keeps the name of the saved file */
const SAVED_NOTE_MS = 6000;

/** Make the picture of the map and save it */
function useScreenshot() {
  const engine = useEu5Engine();
  const mapMode = useEu5MapMode();
  const generating = useEu5IsGeneratingScreenshot();
  // The screenshot is the map as it stands, which on a scrubbed timeline is
  // a past date. The file has the name of what it shows, not of the save.
  const liveDate = useEu5TimelineMapDate();
  const mapDate = useMapHistory()?.preview?.shown?.date ?? liveDate;
  const campaignTitle = useCampaignTitle();
  const captionFor = useCaptionFor();
  const storyParts = useStoryParts();
  const frame = useFrameSelection();
  const [saved, setSaved] = useState<string | null>(null);

  // The word on the button says that the file is on its way, and then its name.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const { isLoading, run } = useTriggeredAction({
    action: async (target: "this view" | "world" | "full" | "selection") => {
      setSaved(null);
      try {
        if (target === "selection") {
          frame();
          await new Promise((resolve) => setTimeout(resolve, FRAME_SETTLE_MS));
        }
        const blob = await engine.trigger.generateScreenshot(
          target === "full",
          captionFor(target === "this view" || target === "selection" ? "this view" : "world"),
        );
        const dateStr = `${mapDate.year}-${String(mapDate.month).padStart(2, "0")}-${String(mapDate.day).padStart(2, "0")}`;
        const file = `${campaignTitle}-${dateStr}-${mapMode}.png`;
        downloadData(blob, file);
        setSaved(file);
      } catch (error) {
        toast.error("Map image error", { description: getErrorMessage(error), duration: 3000 });
      }
    },
  });
  const makeStory = async (draft: boolean) => {
    const caption = captionFor("this view");
    const map = await engine.trigger.generateScreenshot(
      false,
      { ...caption, noPlate: true },
      draft,
    );
    return composeStory({
      map,
      title: caption.title,
      subtitle: caption.subtitle,
      keyLine: caption.keyLine ?? caption.scale?.label,
      ...(await storyParts()),
    });
  };
  // The preview is a draft, and these make the image at its full size.
  const saveStory = () =>
    void makeStory(false)
      .then((blob) => {
        const file = `${campaignTitle}-${mapMode}-story.png`;
        downloadData(blob, file);
        setSaved(file);
      })
      .catch((error: unknown) => {
        toast.error("Map image error", { description: getErrorMessage(error), duration: 3000 });
      });
  const copyStory = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": makeStory(false) })]);
      setSaved("copied");
    } catch (error) {
      toast.error("Map image error", { description: getErrorMessage(error), duration: 3000 });
    }
  };
  return { busy: isLoading || generating, saved, run, makeStory, saveStory, copyStory };
}

/** How long the map may rest before the preview is made again */
const PREVIEW_DELAY_MS = 500;

/** A small copy of the image as a data URL. The page's security policy allows no blob image. */
async function previewUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH;
  canvas.height = Math.round((bitmap.height / bitmap.width) * PREVIEW_WIDTH);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const PREVIEW_WIDTH = 880;

/** The image of the map, its title, and the sentence, as one picture to look at and to share */
function useStoryPreview(open: boolean, make: () => Promise<Blob>, key: string) {
  const [made, setMade] = useState<{ key: string; url: string } | null>(null);
  const makeRef = useRef(make);
  useEffect(() => {
    makeRef.current = make;
  });
  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setTimeout(() => {
      void makeRef
        .current()
        .then(async (blob) => {
          const url = await previewUrl(blob);
          if (live) setMade({ key, url });
        })
        // Without a preview the dialog still has each of its actions.
        .catch(() => {});
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, key]);
  // An image of an earlier view of the map says nothing of this one.
  const current = made?.key === key ? made : null;
  return { url: current?.url ?? null };
}

const ROW_CLASS =
  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-control px-2.5 text-left font-game-ui text-[13px] text-game-ink-100 hover:bg-game-panel-hover disabled:cursor-not-allowed disabled:text-game-ink-500 disabled:hover:bg-transparent";

/**
 * The one place to share. The image to share leads, as it will be: the real story image,
 * made when the dialog opens, with one action to save it and one to copy it. Every other
 * way to get something off the site is under it, with its name.
 */
export function ShareMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { busy, saved, run, makeStory, saveStory, copyStory } = useScreenshot();
  const selection = useEu5SelectionState();
  const hasSelection = selection != null && !selection.isEmpty;
  const timeline = useEu5Timeline();
  const mode = useEu5MapMode();
  const video = timeline.available && isHistoricalMapMode(mode);
  const wide = useBreakpoint("md");
  const figure = useFigure();
  const viewport = useEu5MapViewport();
  const view = viewport?.viewport;
  const key = `${mode}|${figure.title}|${figure.subtitle}|${view?.x}|${view?.y}|${view?.width}`;
  const { url } = useStoryPreview(open, () => makeStory(true), key);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span role="status" className="sr-only">
        {busy
          ? "Making the map image"
          : saved === "copied"
            ? "Image copied"
            : saved
              ? `Saved ${saved}`
              : ""}
      </span>
      <Popover.Trigger asChild>
        <GameButton
          aria-label="Share"
          aria-busy={busy || undefined}
          className={cx("shrink-0", className)}
        >
          {busy ? (
            <LoadingIcon aria-hidden className="h-3.5 w-3.5" />
          ) : saved ? (
            <CheckIcon aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpOnSquareIcon aria-hidden className="h-3.5 w-3.5" />
          )}
          {busy ? (
            "Making image"
          ) : saved === "copied" ? (
            "Image copied"
          ) : saved ? (
            <span title={saved} className="max-w-48 truncate">
              Saved {saved}
            </span>
          ) : (
            "Share"
          )}
        </GameButton>
      </Popover.Trigger>
      <Popover.Content
        aria-label="Share"
        // The map's own keys rest while the dialog is open, and the first action has the focus.
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.querySelector("button")?.focus();
        }}
        side="bottom"
        align="end"
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-[440px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-panel border border-game-line-strong bg-game-panel p-2 font-game-ui shadow-2xl"
      >
        <div className="relative aspect-[5/3] w-full overflow-hidden rounded-[2px] border border-game-line bg-game-page">
          {url ? (
            <img
              src={url}
              alt={`Preview of the story image: ${figure.title}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[12px] text-game-ink-300">
              Making the preview
            </span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <GameButton disabled={busy} className="flex-1 justify-center" onClick={saveStory}>
            <PhotoIcon aria-hidden className="h-4 w-4" />
            Save story image
          </GameButton>
          <GameButton disabled={busy} onClick={() => void copyStory()}>
            <ClipboardDocumentIcon aria-hidden className="h-4 w-4" />
            Copy
          </GameButton>
        </div>
        <CampaignTitleField />
        <div className="mt-1 border-t border-game-line pt-1">
          <button
            type="button"
            disabled={busy}
            className={cx(ROW_CLASS, focusRing)}
            onClick={() => void run("this view")}
          >
            <PhotoIcon aria-hidden className="h-4 w-4" />
            This view only
            <span className="ml-auto pl-3 text-[12px] text-game-ink-500">as on screen</span>
          </button>
          {hasSelection ? (
            <button
              type="button"
              disabled={busy}
              className={cx(ROW_CLASS, focusRing)}
              onClick={() => void run("selection")}
            >
              <PhotoIcon aria-hidden className="h-4 w-4" />
              Framed on the selection
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className={cx(ROW_CLASS, focusRing)}
            onClick={() => void run("world")}
          >
            <GlobeAltIcon aria-hidden className="h-4 w-4" />
            Whole world, 8K
          </button>
          {wide ? (
            <button
              type="button"
              disabled={busy}
              className={cx(ROW_CLASS, focusRing)}
              onClick={() => void run("full")}
            >
              <GlobeAltIcon aria-hidden className="h-4 w-4" />
              Whole world, 16K
            </button>
          ) : null}
          <button
            type="button"
            disabled={!video}
            className={cx(ROW_CLASS, focusRing)}
            // The export panel opens once the dialog has closed and given back the focus.
            onClick={() => {
              setOpen(false);
              setTimeout(
                () =>
                  document
                    .querySelector<HTMLElement>("[aria-label='Export timelapse video']")
                    ?.click(),
                150,
              );
            }}
          >
            <VideoCameraIcon aria-hidden className="h-4 w-4" />
            Timelapse video
            <span className="ml-auto pl-3 text-[12px] text-game-ink-500">
              {!timeline.available
                ? "no border history"
                : video
                  ? "of the campaign"
                  : "Political only"}
            </span>
          </button>
          <ShareLinkItem rowClass={cx(ROW_CLASS, focusRing)} />
        </div>
        <p className="px-2.5 pt-1 pb-1 text-[12px] leading-snug text-game-ink-500">
          An image has the title, the names, the key and the date on it. Nothing leaves your browser
          unless you ask for a link.
        </p>
      </Popover.Content>
    </Popover>
  );
}

/** The name on the images and the header. It starts empty, with what the image would say. */
function CampaignTitleField() {
  const figure = useFigure();
  const custom = useEu5CustomTitle();
  const setTitle = useSetEu5CustomTitle();
  return (
    <label className="mt-2 block px-0.5 font-game-ui text-[12px] text-game-ink-300">
      Title on the image
      <input
        defaultValue={custom ?? ""}
        placeholder={figure.subtitle.replace(/ \w+ \d+$/, "")}
        onBlur={(event) => setTitle(event.target.value)}
        className={cx(
          "mt-1 block h-7 w-full rounded-control border border-game-control-line bg-game-panel px-1.5 text-[13px] text-game-ink-100 placeholder:text-game-ink-500",
          focusRing,
        )}
      />
    </label>
  );
}
