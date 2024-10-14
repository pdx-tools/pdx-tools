import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH } from "map";
import { mapTimelapseCursor, TimelapseEncoder } from "./TimelapseEncoder";
import {
  Eu4Store,
  selectDate,
  useEu4Actions,
  useEu4Context,
  useEu4Map,
  useEu4MapMode,
  useEu4Meta,
  useIsDatePickerEnabled,
  useMapShowStripes,
  usePaintSubjectInOverlordHue,
  useSaveFilenameWith,
  useSelectedDate,
  useShowCountryBorders,
  useShowMapModeBorders,
  useShowProvinceBorders,
  useTerrainOverlay,
} from "../../store";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/Button";
import { Slider } from "@/components/Slider";
import {
  CameraIcon,
  PauseIcon,
  PlayIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/solid";
import { StopIcon } from "@heroicons/react/24/outline";
import { MixerHorizontalIcon } from "@/components/icons/MixerHorizontalIcon";
import { Popover } from "@/components/Popover";
import { useIsDeveloper } from "@/features/account";
import { CountryFilterButton } from "../../components/CountryFilterButton";
import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import { Alert } from "@/components/Alert";
import { emitEvent } from "@/lib/events";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "sonner";
import { throttle } from "@/lib/throttle";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { DropdownMenu } from "@/components/DropdownMenu";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { ExportMenu } from "./ExportMenu";
import { compatibilityReport } from "@/lib/compatibility";
import { captureException } from "@/lib/captureException";

type Interval = "year" | "month" | "week" | "day";

function createTimelapsePayload({
  store,
  interval,
}: {
  store: Eu4Store;
  interval: Interval;
}) {
  const state = store.getState();
  const mapMode = state.mapMode;
  const currentMapDate = selectDate(
    mapMode,
    state.save.meta,
    state.selectedDate,
  );

  return {
    kind: mapMode == "battles" || mapMode == "religion" ? mapMode : "political",
    interval: interval,
    start: currentMapDate.enabledDays ?? 0,
  } as const;
}

export const Timelapse = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isDeveloper = useIsDeveloper();
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(true);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<Interval>("year");
  const filename = useSaveFilenameWith(exportAsMp4 ? ".mp4" : ".webm");
  const encoderRef = useRef<TimelapseEncoder | undefined>(undefined);
  const stopTimelapseReq = useRef<boolean>(false);
  const [recordingSupported] = useState(() => TimelapseEncoder.isSupported());
  const map = useEu4Map();
  const timelapseEnabled = useIsDatePickerEnabled();
  const { updateMap, updateProvinceColors } = useEu4Actions();
  const store = useEu4Context();

  const startTimelapse = async () => {
    emitEvent({ kind: "Timelapse playing" });
    setIsPlaying(true);
    stopTimelapseReq.current = false;
    const timelapsePayload = createTimelapsePayload({
      store,
      interval: intervalSelection,
    });

    try {
      for await (const frame of mapTimelapseCursor(timelapsePayload)) {
        updateMap(frame);
        map.redrawMap();
        await new Promise((res) => setTimeout(res, 1000 / maxFps));
        if (stopTimelapseReq.current) {
          return;
        }
      }

      await updateProvinceColors();
      await map.redrawMap();
    } finally {
      setIsPlaying(false);
    }
  };

  const stopTimelapse = () => {
    stopTimelapseReq.current = true;
    stopRecording();
  };

  const startRecording = async (recordingFrame: string) => {
    setIsRecording(true);
    emitEvent({
      kind: "Timelapse recording",
      view:
        recordingFrame === "None"
          ? "Viewport"
          : `World (1:${recordingFrame.charCodeAt(0) - "0".charCodeAt(0)})`,
    });

    const oldDimensions = [map.canvas.style.width, map.canvas.style.height];
    if (recordingFrame !== "None") {
      const zoom = recordingFrame.charCodeAt(0) - "0".charCodeAt(0);

      await map.stash({ zoom });
      map.canvas.style.width = `${IMG_WIDTH / zoom}px`;
      map.canvas.style.height = `${IMG_HEIGHT / zoom}px`;
    }

    const restoreMapState = () => {
      map.canvas.style.width = oldDimensions[0];
      map.canvas.style.height = oldDimensions[1];
      map.popStash();
    };

    const timelapsePayload = createTimelapsePayload({
      store,
      interval: intervalSelection,
    });
    try {
      const encoding = exportAsMp4 ? "mp4" : "webm";
      const encoder = await TimelapseEncoder.create({
        map,
        encoding,
        frames: mapTimelapseCursor(timelapsePayload),
        fps: maxFps,
        freezeFrame: freezeFrameSeconds,
        store,
      });
      encoderRef.current = encoder;

      await encoder.encodeTimelapse();
      const blob = encoder.finish();

      setIsRecording(false);
      restoreMapState();

      await updateProvinceColors();
      map.redrawMap();
      downloadData(blob, filename);
    } catch (ex) {
      captureException(ex);
      toast.error("Timelapse error", {
        description: getErrorMessage(ex),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      restoreMapState();
      setIsRecording(false);
    }
  };

  const stopRecording = (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    encoderRef.current?.stop();
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-tr-lg bg-slate-900 py-2 pl-3 pr-4">
        <div className="flex items-center justify-center">
          <IconButton
            aria-label="Play timelapse"
            shape="circle"
            variant="ghost"
            className="opacity-75 transition-opacity enabled:hover:opacity-90"
            disabled={!timelapseEnabled || isRecording}
            onClick={!isPlaying ? startTimelapse : stopTimelapse}
            icon={
              !isPlaying ? (
                <PlayIcon className="h-6 w-6" />
              ) : (
                <PauseIcon className="h-6 w-6" />
              )
            }
          />

          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <IconButton
                aria-label="Record timelapse"
                shape="circle"
                variant="ghost"
                className="opacity-60 transition-opacity enabled:hover:opacity-90"
                disabled={!(timelapseEnabled && recordingSupported)}
                onPointerDown={
                  /* https://github.com/radix-ui/primitives/blob/660060/packages/react/dropdown-menu/src/DropdownMenu.tsx#L116 */
                  isRecording ? stopRecording : undefined
                }
                icon={
                  !isRecording ? (
                    <VideoCameraIcon className="h-6 w-6" />
                  ) : (
                    <StopIcon className="h-6 w-6" />
                  )
                }
                tooltip={
                  !recordingSupported
                    ? "Timelapse recording is not supported by your browser"
                    : undefined
                }
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="w-40" sideOffset={7}>
              <DropdownMenu.Item asChild>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => startRecording("None")}
                >
                  <span className="w-full py-2 text-xl tracking-tight">
                    Current view
                  </span>
                </Button>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Button
                  variant="ghost"
                  shape="none"
                  className="w-full"
                  onClick={() => startRecording("4x")}
                >
                  <span className="w-full py-2 text-xl tracking-tight">
                    World (1:4)
                  </span>
                </Button>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Button
                  variant="ghost"
                  shape="none"
                  className="w-full"
                  onClick={() => startRecording("2x")}
                >
                  <span className="w-full py-2 text-xl tracking-tight">
                    World (1:2)
                  </span>
                </Button>
              </DropdownMenu.Item>
              <DropdownMenu.Arrow className="fill-white dark:fill-slate-800" />
            </DropdownMenu.Content>
          </DropdownMenu>

          <Screenshot />

          <Popover>
            <Popover.Trigger asChild>
              <IconButton
                shape="circle"
                variant="ghost"
                className="opacity-60 transition-opacity enabled:hover:opacity-90"
                icon={<MixerHorizontalIcon className="h-6 w-6" />}
                tooltip="Map and timelapse settings"
              />
            </Popover.Trigger>
            <Popover.Content sideOffset={7}>
              <div className="flex flex-col gap-2">
                <div className="flex w-full">
                  <h2 className="grow font-semibold">Map Settings</h2>
                  <div className="flex items-center gap-1">
                    <CountryFilterButton />
                    <ExportMenu />
                  </div>
                </div>
                <TerrainToggleRow />
                <MapStripesToggleRow />
                <PaintSubjectInOverlordHueToggleRow />
                <ProvinceBordersToggleRow />
                <CountryBordersToggleRow />
                <MapModeBordersToggleRow />
              </div>
              <div className="flex flex-col gap-3 py-6">
                <div>
                  <label>
                    <div>
                      Timelapse speed: {`${maxFps} ${intervalSelection}`}s/s
                    </div>
                    <Slider
                      className="mt-1"
                      value={[intervalFpsToSlider(intervalSelection, maxFps)]}
                      min={1}
                      max={83}
                      onValueChange={(v) => {
                        const value = v[0];
                        if (value <= intervalOffset("month")) {
                          setIntervalSelection("day");
                          setMaxFps(value);
                        } else if (value <= intervalOffset("year")) {
                          setIntervalSelection("month");
                          setMaxFps(value - intervalOffset("month"));
                        } else {
                          setIntervalSelection("year");
                          setMaxFps(value - intervalOffset("year") + 1);
                        }
                      }}
                    />
                  </label>
                </div>
                {isDeveloper && recordingSupported && (
                  <ToggleRow
                    text="Export as MP4"
                    onChange={setExportAsMp4}
                    value={exportAsMp4}
                    help="Export the recording as an MP4 instead of Webm"
                  />
                )}
                {!recordingSupported ? (
                  <Alert variant="info" className="max-w-xs px-4 py-2">
                    <Alert.Description>
                      Browser does not support timelapse recording.{" "}
                      <Link href="https://caniuse.com/mdn-api_videoencoder">
                        See supported browsers
                      </Link>{" "}
                      like Chrome.{" "}
                      <Link
                        target="_blank"
                        href="/blog/a-new-timelapse-video-recorder"
                        aria-label="Read more about new video encoder"
                      >
                        Read more
                      </Link>
                    </Alert.Description>
                  </Alert>
                ) : null}
              </div>
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
            </Popover.Content>
          </Popover>
        </div>
        <div className="whitespace-nowrap text-base opacity-60">
          <TimelapseDate />
        </div>
      </div>

      <TimelapseSlider />
    </>
  );
};

function TimelapseDate() {
  const currentMapDate = useSelectedDate();
  return currentMapDate.text;
}

function TimelapseSlider() {
  const datePickerEnabled = useIsDatePickerEnabled();
  const meta = useEu4Meta();
  const currentMapDate = useSelectedDate();
  const { setSelectedDateDay } = useEu4Actions();
  const dayChange = useMemo(
    () => throttle(setSelectedDateDay, 100),
    [setSelectedDateDay],
  );

  return (
    <Slider
      value={[currentMapDate.days]}
      disabled={!datePickerEnabled}
      max={meta.total_days}
      onValueChange={(v) => dayChange(v[0])}
      className={cx(!datePickerEnabled && "hidden", "grow opacity-80")}
      rounded={false}
    />
  );
}

function intervalFpsToSlider(i: Interval, fps: number) {
  const base = intervalOffset(i) + fps;
  if (i == "year") {
    return base - 1;
  } else {
    return base;
  }
}

function intervalOffset(i: Interval) {
  switch (i) {
    case "day":
    case "week":
      return 0;
    case "month":
      return 30;
    case "year":
      return 54;
  }
}

const TerrainToggleRow = () => {
  const data = useTerrainOverlay();
  const { setTerrainOverlay } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setTerrainOverlay}
      text="Overlay terrain textures"
    />
  );
};

const MapStripesToggleRow = () => {
  const data = useMapShowStripes();
  const { setMapShowStripes } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setMapShowStripes}
      text="Paint map mode stripes"
    />
  );
};

const PaintSubjectInOverlordHueToggleRow = () => {
  const data = usePaintSubjectInOverlordHue();
  const { setPaintSubjectInOverlordHue } = useEu4Actions();
  const mapMode = useEu4MapMode();
  const overlordHueDisabled = mapMode != "political";

  return (
    <ToggleRow
      value={data}
      onChange={setPaintSubjectInOverlordHue}
      text="Paint subjects in overlord hue"
      disabled={overlordHueDisabled}
    />
  );
};

const ProvinceBordersToggleRow = () => {
  const data = useShowProvinceBorders();
  const { setShowProvinceBorders } = useEu4Actions();
  return (
    <ToggleRow
      value={data}
      onChange={setShowProvinceBorders}
      text="Paint province borders"
    />
  );
};

const CountryBordersToggleRow = () => {
  const data = useShowCountryBorders();
  const { setShowCountryBorders } = useEu4Actions();

  return (
    <ToggleRow
      value={data}
      onChange={setShowCountryBorders}
      text="Paint country borders"
    />
  );
};

const MapModeBordersToggleRow = () => {
  const data = useShowMapModeBorders();
  const { setShowMapModeBorders } = useEu4Actions();

  return (
    <ToggleRow
      value={data}
      onChange={setShowMapModeBorders}
      text="Paint map mode borders"
    />
  );
};

function Screenshot() {
  const meta = useEu4Meta();
  const map = useEu4Map();
  const terrainOverlay = useTerrainOverlay();
  const mapMode = useEu4MapMode();
  const [supportedTextureSize, setSupportedTextureSize] = useState(0);
  const currentMapDate = useSelectedDate();

  useEffect(() => {
    const report = compatibilityReport();
    if (report.webgl2.enabled) {
      setSupportedTextureSize(report.webgl2.textureSize.actual);
    }
  }, []);

  // exporting as webp may seem enticing, but it's a trap, stick to png
  const exportType = terrainOverlay ? "png" : "png";

  const downloadDataFile = async (data: Blob, suffix: string) => {
    let outName = meta.save_game.replace(".eu4", "");
    outName = `${outName}-${meta.date}-${mapMode}-${suffix}.${exportType}`;

    downloadData(data, outName);
    if (document.hasFocus()) {
      const item = new ClipboardItem({ [`image/${exportType}`]: data });
      await navigator.clipboard.write([item]);
      toast.success("Screenshot downloaded and copied to clipboard", {
        duration: 2000,
      });
    } else {
      toast.success("Screenshot downloaded", {
        duration: 2000,
      });
    }
  };

  const { isLoading: isExporting, run } = useTriggeredAction({
    action: async (type: "view" | 1 | 2 | 3) => {
      const fontFamily = getComputedStyle(document.body).fontFamily;
      switch (type) {
        case "view": {
          const data = await map.screenshot({
            kind: "viewport",
            date: currentMapDate.text,
            fontFamily,
          });
          downloadDataFile(data, "view");
          emitEvent({ kind: "Screenshot taken", view: "Viewport" });
          break;
        }
        default: {
          const data = await map.screenshot({
            kind: "world",
            scale: type,
            date: currentMapDate.text,
            fontFamily,
          });
          downloadDataFile(data, type == 1 ? "map" : `map-${type}x`);
          emitEvent({ kind: "Screenshot taken", view: `World (${type}:1)` });
          break;
        }
      }
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IconButton
          disabled={isExporting}
          shape="circle"
          variant="ghost"
          className="opacity-60 transition-opacity enabled:hover:opacity-90"
          aria-label="take screenshot"
          icon={
            isExporting ? (
              <LoadingIcon className="h-6 w-6" />
            ) : (
              <CameraIcon className="h-6 w-6" />
            )
          }
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-40" sideOffset={7}>
        <DropdownMenu.Item asChild>
          <Button
            id="screenshot-map-btn"
            variant="ghost"
            className="w-full"
            onClick={() => run("view")}
          >
            <span className="w-full py-2 text-xl tracking-tight">
              Current view
            </span>
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild disabled={supportedTextureSize < IMG_WIDTH}>
          <Button
            variant="ghost"
            shape="none"
            className="w-full"
            onClick={() => run(1)}
          >
            <span className="w-full py-2 text-xl tracking-tight">
              World (1:1)
            </span>
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          asChild
          disabled={supportedTextureSize < IMG_WIDTH * 2}
        >
          <Button
            variant="ghost"
            shape="none"
            className="w-full"
            onClick={() => run(2)}
          >
            <span className="w-full py-2 text-xl tracking-tight">
              World (2:1)
            </span>
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Arrow className="fill-white dark:fill-slate-800" />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
