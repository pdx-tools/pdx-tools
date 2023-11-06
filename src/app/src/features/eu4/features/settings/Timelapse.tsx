import { useMemo, useRef, useState } from "react";
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH, throttle } from "map";
import { mapTimelapseCursor, TimelapseEncoder } from "./TimelapseEncoder";
import { captureException } from "@/features/errors";
import {
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
import { ToggleGroup } from "@/components/ToggleGroup";
import { Slider } from "@/components/Slider";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import { StopIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { MixerHorizontalIcon } from "@/components/icons/MixerHorizontalIcon";
import { Popover } from "@/components/Popover";
import { useIsDeveloper } from "@/features/account";
import { MapExportMenu } from "./MapExportMenu";
import { CountryFilterButton } from "../../components/CountryFilterButton";
import { cx } from "class-variance-authority";
import { ErrorDialog } from "@/components/ErrorDialog";
import { Link } from "@/components/Link";
import { Alert } from "@/components/Alert";
import { emitEvent } from "@/lib/plausible";

interface MapState {
  focusPoint: [number, number];
  scale: number;
  width: number;
  height: number;
}
type Interval = "year" | "month" | "week" | "day";

export const Timelapse = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingFrame, setRecordingFrame] = useState("None");
  const meta = useEu4Meta();
  const isDeveloper = useIsDeveloper();
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(true);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<Interval>("year");
  const currentMapDate = useSelectedDate();
  const filename = useSaveFilenameWith(exportAsMp4 ? ".mp4" : ".webm");
  const encoderRef = useRef<TimelapseEncoder | undefined>(undefined);
  const stopTimelapseReq = useRef<boolean>(false);
  const [recordingSupported] = useState(() => TimelapseEncoder.isSupported());
  const map = useEu4Map();
  const timelapseEnabled = useIsDatePickerEnabled();
  const { updateMap, updateProvinceColors, setSelectedDateDay } =
    useEu4Actions();
  const store = useEu4Context();
  const mapMode = useEu4MapMode();
  const [timelapseError, setTimelapseError] = useState<unknown | null>(null);
  const timelapsePayload = {
    kind: mapMode == "battles" || mapMode == "religion" ? mapMode : "political",
    interval: intervalSelection,
    start: currentMapDate.enabledDays ?? 0,
  } as const;

  const datePickerEnabled = useIsDatePickerEnabled();

  const dayChange = useMemo(
    () => throttle(setSelectedDateDay, 100),
    [setSelectedDateDay],
  );

  const startTimelapse = async () => {
    emitEvent({ kind: "play-timelapse" });
    setIsPlaying(true);
    stopTimelapseReq.current = false;

    try {
      for await (const frame of mapTimelapseCursor(timelapsePayload)) {
        updateMap(frame);
        map.redrawMapImage();
        await new Promise((res) => setTimeout(res, 1000 / maxFps));
        if (stopTimelapseReq.current) {
          return;
        }
      }

      await updateProvinceColors();
      map.redrawMapNow();
    } finally {
      setIsPlaying(false);
    }
  };

  const stopTimelapse = () => {
    stopTimelapseReq.current = true;
    stopRecording();
  };

  const startRecording = async () => {
    emitEvent({ kind: "record-timelapse" });
    setIsRecording(true);

    let savedMapStateRef: MapState | undefined;
    if (recordingFrame !== "None") {
      const zoom = recordingFrame.charCodeAt(0) - "0".charCodeAt(0);

      savedMapStateRef = {
        width: map.gl.canvas.width,
        height: map.gl.canvas.height,
        focusPoint: map.focusPoint,
        scale: map.scale,
      };

      map.focusPoint = [0, 0];
      map.scale = 1;
      map.resize(IMG_WIDTH / zoom, IMG_HEIGHT / zoom);
      map.redrawViewport();
    }

    const restoreMapState = () => {
      if (savedMapStateRef) {
        map.focusPoint = savedMapStateRef.focusPoint;
        map.scale = savedMapStateRef.scale;
        map.resize(savedMapStateRef.width, savedMapStateRef.height);
        savedMapStateRef = undefined;
      }
    };

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
      map.redrawMapImage();
      downloadData(blob, filename);
    } catch (ex) {
      captureException(ex);
      setTimelapseError(ex);
    } finally {
      restoreMapState();
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    encoderRef.current?.stop();
  };

  return (
    <>
      <div className="bg-[#001529] rounded-tr-lg flex gap-2 items-center pl-3 pr-4 py-2">
        <div className="flex items-center justify-center">
          <IconButton
            shape="circle"
            variant="ghost"
            disabled={!timelapseEnabled}
            onClick={!isPlaying ? startTimelapse : stopTimelapse}
            icon={
              !isPlaying ? (
                <PlayIcon className="h-6 w-6 opacity-75" />
              ) : (
                <PauseIcon className="h-6 w-6" />
              )
            }
            tooltip={!isPlaying ? "Start timelapse" : "Stop timelapse"}
          />

          <IconButton
            shape="circle"
            variant="ghost"
            disabled={!(timelapseEnabled && recordingSupported)}
            onClick={!isRecording ? startRecording : stopRecording}
            icon={
              !isRecording ? (
                <VideoCameraIcon className="opacity-60 h-6 w-6" />
              ) : (
                <StopIcon className="h-6 w-6" />
              )
            }
            tooltip={
              !recordingSupported
                ? "Timelapse recording is not supported by your browser"
                : !isRecording
                ? "Start recording timelapse"
                : "Stop recording timelapse"
            }
          />

          <Popover>
            <Popover.Trigger asChild>
              <IconButton
                shape="circle"
                variant="ghost"
                icon={<MixerHorizontalIcon className="opacity-60 h-6 w-6" />}
                tooltip="Map and timelapse settings"
              />
            </Popover.Trigger>
            <Popover.Content sideOffset={7}>
              <div className="flex flex-col gap-1">
                <div className="flex w-full">
                  <h2 className="font-semibold grow">Map Settings</h2>
                  <div className="flex gap-1 items-center">
                    <CountryFilterButton />
                    <MapExportMenu />
                  </div>
                </div>
                <TerrainToggleRow />
                <MapStripesToggleRow />
                <PaintSubjectInOverlordHueToggleRow />
                <ProvinceBordersToggleRow />
                <CountryBordersToggleRow />
                <MapModeBordersToggleRow />
              </div>
              <div className="flex flex-col gap-3 py-3">
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
                {recordingSupported && (
                  <div>
                    <div>Recording output:</div>
                    <ToggleGroup
                      type="single"
                      className="inline-flex"
                      value={recordingFrame}
                      onValueChange={(e) => e && setRecordingFrame(e)}
                    >
                      <ToggleGroup.Item value="None" asChild>
                        <Button shape="none" className="px-4 py-2">
                          Map
                        </Button>
                      </ToggleGroup.Item>
                      <ToggleGroup.Item value="4x" asChild>
                        <Button shape="none" className="px-4 py-2">
                          World (1:4)
                        </Button>
                      </ToggleGroup.Item>
                      <ToggleGroup.Item value="2x" asChild>
                        <Button shape="none" className="px-4 py-2">
                          World (1:2)
                        </Button>
                      </ToggleGroup.Item>
                    </ToggleGroup>
                  </div>
                )}
                {isDeveloper && recordingSupported && (
                  <ToggleRow
                    text="Export as MP4"
                    onChange={setExportAsMp4}
                    value={exportAsMp4}
                    help="Export the recording as an MP4 instead of Webm"
                  />
                )}
                {!recordingSupported ? (
                  <Alert variant="info" className="px-4 py-2 max-w-xs">
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
              <Popover.Arrow className="fill-white" />
            </Popover.Content>
          </Popover>
        </div>
        <div className="whitespace-nowrap text-base opacity-60">
          {currentMapDate.text}
        </div>
        <ErrorDialog
          error={timelapseError}
          title="The timelapse engine encountered an error"
        />
      </div>

      <Slider
        value={[currentMapDate.days]}
        disabled={!datePickerEnabled}
        max={meta.total_days}
        onValueChange={(v) => dayChange(v[0])}
        className={cx(!datePickerEnabled && "hidden", "grow opacity-80")}
        rounded={false}
      />
    </>
  );
};

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
