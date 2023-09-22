import { useRef, useState } from "react";
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH } from "map";
import { mapTimelapseCursor, TimelapseEncoder } from "./TimelapseEncoder";
import { captureException } from "@/features/errors";
import {
  useEu4Actions,
  useEu4Context,
  useEu4Map,
  useEu4MapMode,
  useIsDatePickerEnabled,
  useSaveFilenameWith,
  useSelectedDate,
} from "../../store";
import { Alert } from "@/components/Alert";
import { IconButton } from "@/components/IconButton";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { ToggleGroup } from "@/components/ToggleGroup";
import { Slider } from "@/components/Slider";
import { Link } from "@/components/Link";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import { StopIcon, VideoCameraIcon } from "@heroicons/react/24/outline";

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
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(false);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<Interval>("year");
  const currentMapDate = useSelectedDate();
  const filename = useSaveFilenameWith(exportAsMp4 ? ".mp4" : ".webm");
  const encoderRef = useRef<TimelapseEncoder | undefined>(undefined);
  const stopTimelapseReq = useRef<boolean>(false);
  const [recordingSupported] = useState(() => TimelapseEncoder.isSupported());
  const map = useEu4Map();
  const timelapseEnabled = useIsDatePickerEnabled();
  const { updateMap, updateProvinceColors } = useEu4Actions();
  const store = useEu4Context();
  const mapMode = useEu4MapMode();
  const [timelapseError, setTimelapseError] = useState<unknown | null>(null);
  const timelapsePayload = {
    kind: mapMode == "battles" || mapMode == "religion" ? mapMode : "political",
    interval: intervalSelection,
    start: currentMapDate.enabledDays ?? 0,
  } as const;

  const startTimelapse = async () => {
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
      <div className="flex items-center justify-center gap-2">
        <IconButton
          shape="circle"
          disabled={!timelapseEnabled}
          onClick={!isPlaying ? startTimelapse : stopTimelapse}
          icon={
            !isPlaying ? (
              <PlayIcon className="h-4 w-4 opacity-75" />
            ) : (
              <PauseIcon className="h-4 w-4" />
            )
          }
          tooltip={!isPlaying ? "Start timelapse" : "Stop timelapse"}
        />

        <IconButton
          shape="circle"
          disabled={!(timelapseEnabled && recordingSupported)}
          onClick={!isRecording ? startRecording : stopRecording}
          icon={
            !isRecording ? (
              <VideoCameraIcon className="h-4 w-4" />
            ) : (
              <StopIcon className="h-4 w-4" />
            )
          }
          tooltip={!isRecording ? "Start recording" : "Stop recording"}
        />
      </div>
      {timelapseError !== null && (
        <Alert variant="error" className="px-4 py-2">
          <Alert.Title>The timelapse engine encountered an error</Alert.Title>
          <Alert.Description>{`${timelapseError}`}</Alert.Description>
        </Alert>
      )}
      {!recordingSupported && (
        <Alert variant="info" className="px-4 py-2">
          <Alert.Description>
            Browser does not support timelapse recording.{" "}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://caniuse.com/mdn-api_videoencoder"
            >
              See supported browsers
            </a>{" "}
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
      )}
      <ToggleGroup
        type="single"
        className="inline-flex self-center"
        value={intervalSelection}
        onValueChange={(e) => e && setIntervalSelection(e as Interval)}
      >
        <ToggleGroup.Item value="year" asChild>
          <Button shape="none" className="px-4 py-2">
            Year
          </Button>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="month" asChild>
          <Button shape="none" className="px-4 py-2">
            Month
          </Button>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="week" asChild>
          <Button shape="none" className="px-4 py-2">
            Week
          </Button>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="day" asChild>
          <Button shape="none" className="px-4 py-2">
            Day
          </Button>
        </ToggleGroup.Item>
      </ToggleGroup>
      <div>
        <label>
          <div>Max intervals per second:</div>
          <Slider
            className="mt-1"
            value={[maxFps]}
            min={5}
            max={30}
            onValueChange={(v) => setMaxFps(v[0])}
          />
        </label>
        <div className="flex justify-between">
          {[5, 10, 15, 20, 25, 30].map((x) => (
            <Button
              shape="none"
              variant="ghost"
              className="first:ml-2"
              key={x}
              onClick={() => setMaxFps(x)}
            >
              {x}
            </Button>
          ))}
        </div>
      </div>
      {recordingSupported && (
        <div>
          <div>Recording Frame:</div>
          <ToggleGroup
            type="single"
            className="inline-flex"
            value={recordingFrame}
            onValueChange={(e) => e && setRecordingFrame(e)}
          >
            <ToggleGroup.Item value="None" asChild>
              <Button shape="none" className="px-4 py-2">
                None
              </Button>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="8x" asChild>
              <Button shape="none" className="px-4 py-2">
                8x
              </Button>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="4x" asChild>
              <Button shape="none" className="px-4 py-2">
                4x
              </Button>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="2x" asChild>
              <Button shape="none" className="px-4 py-2">
                2x
              </Button>
            </ToggleGroup.Item>
          </ToggleGroup>
        </div>
      )}
      {recordingSupported && (
        <div className="flex items-center gap-3">
          <div className="w-12">
            <Input
              type="number"
              min={0}
              max={8}
              value={freezeFrameSeconds}
              onChange={(x) => setFreezeFrameSeconds(+x.target.value ?? 0)}
            />
          </div>
          <div>Seconds of final freeze frame</div>
        </div>
      )}

      {recordingSupported && (
        <ToggleRow
          text="Export as MP4"
          onChange={setExportAsMp4}
          value={exportAsMp4}
          help="Export the recording as an MP4 instead of Webm"
        />
      )}
    </>
  );
};
