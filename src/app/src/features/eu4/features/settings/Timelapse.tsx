import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Button,
  Radio,
  Tooltip,
  Form,
  InputNumber,
  Row,
  Col,
  Slider,
  Modal,
} from "antd";
import {
  CaretRightOutlined,
  PauseOutlined,
  VideoCameraOutlined,
  VideoCameraTwoTone,
} from "@ant-design/icons";
import {
  getWasmWorker,
  useWasmWorker,
  getEu4Map,
  getCanvas,
  getEu4Canvas,
  useCanvasContext,
  selectAnalyzeFileName,
} from "@/features/engine";
import {
  selectEu4MapDate,
  setMapControls,
  setMapDate,
  useEu4Meta,
} from "../../eu4Slice";
import { MapDate } from "../../types/models";
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH, WebGLMap } from "@/map/map";
import { selectIsDeveloper } from "@/features/account";
import { MapControls } from "../../types/map";
import { useAppSelector } from "@/lib/store";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

function getSupportedCodec() {
  const vp9 = "video/webm;codecs=vp8";
  const vp8 = "video/webm;codecs=vp8";
  if (MediaRecorder.isTypeSupported(vp9)) {
    return vp9;
  } else if (MediaRecorder.isTypeSupported(vp8)) {
    return vp8;
  } else {
    throw new Error("VP9 and VP8 codecs are not supported by current browser");
  }
}

let ffmpegModule: Promise<FFmpeg> | undefined = undefined;

async function transcode(webmInput: Uint8Array, isDeveloper: boolean) {
  if (ffmpegModule === undefined) {
    // ffmpeg has a bit of a weird way of initializing itself, where it will do a
    // string replace on "ffmpeg-core.js" for hard-coded paths of where the wasm
    // should be. I don't want to fiddle around with how to cater to this, so we
    // just pull the library and wasm from jsdelivr. ref:
    // https://github.com/ffmpegwasm/ffmpeg.wasm/blob/4c3a85b2e6617b8b0692edaf87936a290ecfbdf2/src/browser/getCreateFFmpegCore.js#L31
    ffmpegModule = import("@ffmpeg/ffmpeg").then(async (mod) => {
      const x = mod.createFFmpeg({
        log: isDeveloper,
        corePath:
          "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js",
      });
      await x.load();
      return x;
    });
  }

  const ffmpeg = await ffmpegModule;
  ffmpeg.FS("writeFile", "recording.webm", new Uint8Array(webmInput));
  try {
    // prettier-ignore
    await ffmpeg.run(
      "-i", "recording.webm",

      // ref: https://stackoverflow.com/a/20848224/433785
      "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",

      // ref: https://superuser.com/q/1308355/635104
      "-vsync", "0",

      "-vcodec", "libx264",
      "recording.mp4"
    );
    const mp4Data = ffmpeg.FS("readFile", "recording.mp4");
    const mp4Blob = new Blob([mp4Data], {
      type: "video/mp4",
    });

    // can't call ffmpeg.exit here due to
    // https://github.com/ffmpegwasm/ffmpeg.wasm/issues/242 so we just keep
    // around a single instance of ffmpeg
    return mp4Blob;
  } finally {
    ffmpeg.FS("unlink", "recording.mp4");
  }
}

class MapRecorder {
  chunks: Blob[] = [];
  recorder: MediaRecorder;
  stopPromise: Promise<void>;
  postTimelapseRaf = 0;
  preTimelapseRaf = 0;
  hasStarted: Promise<void> | undefined = undefined;
  hasStopped = false;

  constructor(private recordingCanvas: HTMLCanvasElement, maxFps: number) {
    // Side note: for some reason chrome media recorder won't record changes
    // that occur more than 250ms apart (in spite of the framerate that we
    // capture the stream at), so we set force the interval to be a max of 250ms
    // apart from each other.
    const stream = recordingCanvas.captureStream(Math.ceil(maxFps * 1.25));
    this.recorder = new MediaRecorder(stream, {
      mimeType: getSupportedCodec(),
    });

    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size !== 0) {
        this.chunks.push(e.data);
      }
    });

    this.stopPromise = new Promise((resolve) => {
      this.recorder.addEventListener("stop", () => {
        resolve();
      });
    });

    // This kludge is for making sure that the recording starts at the right
    // date, as it's possible for the recording to not start until several
    // intervals into the timelapse, so this promise is used to pause the
    // timelapse until we've written at least one frame.
    this.hasStarted = new Promise((resolve) => {
      const gotData = (e: BlobEvent) => {
        if (e.data.size !== 0) {
          this.recorder.removeEventListener("dataavailable", gotData);
          cancelAnimationFrame(this.preTimelapseRaf);
          this.preTimelapseRaf = 0;
          requestAnimationFrame(() => resolve());
        }
      };
      this.recorder.addEventListener("dataavailable", gotData);
    });
  }

  start() {
    this.recorder.start();
    this.preTimelapseRaf = requestAnimationFrame(() => this.preTimelapseLoop());
  }

  /// Write a blank rectangle to the recording canvas to try and coax
  /// the recorder to capture additional data.
  private drawNoop() {
    const ctx = this.recordingCanvas?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgb(0,0,0,0)";
      ctx.fillRect(0, 0, 1, 1);
    }
  }

  private preTimelapseLoop() {
    if (this.recorder.state === "inactive") {
      return;
    }

    if (this.chunks.length !== 0) {
      return;
    }

    this.drawNoop();
    this.recorder.requestData();
    this.preTimelapseRaf = requestAnimationFrame(() => this.preTimelapseLoop());
  }

  // After we're done recording, create an animation loop to write
  // blank data to the canvas as chrome is cutting us short
  // and stops the recording wayyyyy too early.
  // ref: https://stackoverflow.com/q/66813248/433785
  private postTimelapseLoop(startTime: number, freezeFrameSeconds: number) {
    if (this.recorder.state === "inactive") {
      return;
    }

    this.drawNoop();
    this.postTimelapseRaf = requestAnimationFrame((t) => {
      const hasHitFreezeFrameTarget =
        (t - startTime) / 1000 > freezeFrameSeconds;
      if (hasHitFreezeFrameTarget) {
        this.hasStopped = true;
        if (this.recorder.state !== "inactive") {
          this.recorder.requestData();
        }
      }

      this.postTimelapseLoop(startTime, freezeFrameSeconds);
    });
  }

  async stopCapture(freezeFrameSeconds: number): Promise<Blob[]> {
    const startTime = performance.now();
    this.recorder.requestData();
    this.postTimelapseLoop(startTime, freezeFrameSeconds);

    // Now wait until we've written out the final frame
    await new Promise((resolve) => {
      const gotData = (e: BlobEvent) => {
        if (this.hasStopped && e.data.size !== 0) {
          this.recorder.removeEventListener("dataavailable", gotData);
          resolve(void 0);
        }
      };

      this.recorder.addEventListener("dataavailable", gotData);
    });

    this.recorder.stop();
    await this.stopPromise;

    const result = this.chunks;
    this.teardown();
    return result;
  }

  teardown() {
    cancelAnimationFrame(this.postTimelapseRaf);
    this.chunks = [];
    this.recordingCanvas.remove();
  }
}

interface MapState {
  focusPoint: [number, number];
  scale: number;
  width: number;
  height: number;
}

export const Timelapse = () => {
  const dispatch = useDispatch();
  const meta = useEu4Meta();
  const workerRef = useWasmWorker();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [syncRecording, setSyncRecording] = useState(true);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [recordingFrame, setRecordingFrame] = useState("None");
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(false);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<string>("Year");
  const currentMapDate = useSelector(selectEu4MapDate);
  const savedMapStateRef = useRef<MapState | undefined>(undefined);
  const mapControls = useAppSelector((x) => x.eu4.mapControls);
  const savedMapControls = useRef<MapControls>(mapControls);
  const rafId = useRef(0);
  const currentDateText = useRef(meta.start_date);
  const canvasContext = useCanvasContext();
  const recorder = useRef<MapRecorder | undefined>(undefined);
  const stopRecordingOnNextCommit = useRef<boolean>(false);
  const finalDrawCommitted = useRef<Promise<void> | undefined>(undefined);
  const [form] = Form.useForm();
  const isDeveloper = useSelector(selectIsDeveloper);
  const filename = useSelector(selectAnalyzeFileName);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      recorder.current?.teardown();
    };
  }, []);

  const startTimelapse = () => {
    const startDate: MapDate =
      currentMapDate.days == meta.total_days
        ? {
            days: 0,
            text: meta.start_date,
          }
        : currentMapDate;

    setIsPlaying(true);
    const worker = getWasmWorker(workerRef);

    let lastTimestamp = 0;
    let date = startDate;
    const timestep = 1000 / maxFps;

    if (syncRecording) {
      // When we're recording a timelapse, we don't want the last frame to
      // include map options excluded from previous frames. Ie: we don't want
      // the last frame to show striped political provinces when the timelapse
      // didn't. So we save the current controls to restore them later.
      savedMapControls.current = mapControls;
      const mode =
        mapControls.mode == "political" || mapControls.mode == "religion"
          ? mapControls.mode
          : "political";
      dispatch(
        setMapControls({
          ...mapControls,
          mode,
          borderFill: "Provinces",
          showController: false,
          showCountryBorders: false,
          showMapModeBorders: false,
          paintSubjectInOverlordHue: false,
        })
      );

      // Prime the recording to start at the correct date
      dispatch(setMapDate(date));
    }

    let recorderLock = false;
    const rafUpdate: FrameRequestCallback = async (timestamp) => {
      rafId.current = requestAnimationFrame(rafUpdate);

      if (timestamp - lastTimestamp < timestep) {
        return;
      }

      // If we are recording, stall until the recorder has started,
      if (recorderLock) {
        return;
      } else if (recorder.current?.hasStarted) {
        recorderLock = true;
        await recorder.current.hasStarted;
        recorderLock = false;
      }

      lastTimestamp = timestamp;

      // If we're recording and it's been more than 3 seconds then we will
      // assume the user navigated away. Navigating away during a recording will
      // cause issues and there is no way to persist animation frames when in a
      // background tab.
      if (recorder.current && timestamp - (lastTimestamp || timestamp) > 3000) {
        recorder.current.teardown();
        recorder.current = undefined;
        stopTimelapse();
        setIsRecording(false);
        restoreMapPriorToRecording();

        Modal.warning({
          title: "Gap in recording",
          content:
            "Navigating away while recording may corrupt the output. Please do not navigate away while recording. During the transcoding to MP4 phase, it is ok to navigate away",
        });
        return;
      }

      dispatch(setMapDate(date));

      if (date.days == meta.total_days) {
        stopTimelapseWithSync();
        return;
      }

      date = await worker.eu4IncrementDate(date.days, intervalSelection);
      if (date.days > meta.total_days) {
        date = {
          days: meta.total_days,
          text: meta.date,
        };
      }
      currentDateText.current = date.text;
    };
    rafId.current = requestAnimationFrame(rafUpdate);
  };

  const stopTimelapseWithSync = () => {
    setIsPlaying(false);
    cancelAnimationFrame(rafId.current);
    const prevRafId = rafId.current;
    rafId.current = 0;

    if (syncRecording && prevRafId !== 0) {
      stopRecordingOnNextCommit.current = true;
    }
  };

  const stopTimelapse = () => {
    setIsPlaying(false);
    cancelAnimationFrame(rafId.current);
    rafId.current = 0;
  };

  const startRecording = async () => {
    stopRecordingOnNextCommit.current = false;
    finalDrawCommitted.current = undefined;
    setIsRecording(true);

    const canvas = getCanvas(canvasContext.canvasRef);
    const eu4Canvas = getEu4Canvas(canvasContext.eu4CanvasRef);
    const eu4Map = getEu4Map(canvasContext.eu4CanvasRef);
    if (recordingFrame !== "None") {
      const zoom = recordingFrame.charCodeAt(0) - "0".charCodeAt(0);

      savedMapStateRef.current = {
        width: canvas.width,
        height: canvas.height,
        focusPoint: eu4Map.focusPoint,
        scale: eu4Map.scale,
      };

      canvasContext.sizeOverrideRef.current = true;
      canvas.style.removeProperty("max-width");
      eu4Map.focusPoint = [0, 0];
      eu4Map.scale = 1;
      eu4Canvas.resize(IMG_WIDTH / zoom, IMG_HEIGHT / zoom);
      eu4Canvas.redrawViewport();
    }

    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = canvas.width;
    recordingCanvas.height = canvas.height;

    // get 2d context without alpha:
    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency
    const ctx2d = recordingCanvas.getContext("2d", { alpha: false });
    if (ctx2d === null) {
      throw new Error("expected recording canvas 2d contex to be defined");
    }

    recorder.current = new MapRecorder(recordingCanvas, maxFps);

    if (syncRecording) {
      startTimelapse();

      // A heuristic to wait for the timelapse to get us to the starting date
      await new Promise((resolve) => {
        const origDraw = eu4Map.onDraw;
        eu4Map.onDraw = (...args) => {
          origDraw?.(...args);
          resolve(void 0);
          eu4Map.onDraw = origDraw;
        };
      });
    }

    const create2dFrame = (ctx: WebGL2RenderingContext) => {
      const scale = recordingCanvas.width > 2000 ? 2 : 1;

      // Create rectangle to hold text
      ctx2d.drawImage(ctx.canvas, 0, 0);
      ctx2d.fillStyle = "#20272c";
      ctx2d.fillRect(
        recordingCanvas.width - 130 * scale,
        0,
        130 * scale,
        50 * scale
      );

      const fontFamily =
        "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif";
      ctx2d.fillStyle = "#ffffff";
      ctx2d.textAlign = "right";
      ctx2d.font = `700 ${12 * scale}px ${fontFamily}`;
      ctx2d.fillText(
        `PDX.TOOLS`,
        recordingCanvas.width - 11 * scale,
        15 * scale
      );
      ctx2d.font = `700 ${20 * scale}px ${fontFamily}`;
      ctx2d.fillText(
        currentDateText.current,
        recordingCanvas.width - 10 * scale,
        35 * scale
      );

      if (stopRecordingOnNextCommit.current) {
        stopRecording();
      }
    };

    // We don't want our recording to start with a black map so we're going to
    // wait to start the recording until we've drawn at least one frame.
    const waitForFirst2dFrame = new Promise((resolve) => {
      eu4Map.onCommit = (ctx) => {
        create2dFrame(ctx);
        requestAnimationFrame(() => resolve(void 0));
      };
    });

    eu4Map.redrawViewport();
    await waitForFirst2dFrame;

    eu4Map.onCommit = create2dFrame;
    recorder.current?.start();
  };

  const stopRecordingWithSync = async () => {
    if (syncRecording) {
      stopTimelapse();
      dispatch(setMapControls(savedMapControls.current));
    }

    stopRecording();
  };

  const stopRecording = async () => {
    setIsRecording(false);

    if (!recorder.current) {
      return;
    }

    if (freezeFrameSeconds !== 0) {
      setIsTranscoding(true);
    }

    const data = await recorder.current.stopCapture(freezeFrameSeconds);
    recorder.current = undefined;

    const eu4Map = getEu4Map(canvasContext.eu4CanvasRef);
    eu4Map.onCommit = undefined;

    const blob = new Blob(data, {
      type: "video/webm",
    });

    const extension = exportAsMp4 ? "mp4" : "webm";
    const nameInd = filename.lastIndexOf(".");
    const outputName =
      nameInd == -1
        ? `${filename}.${extension}`
        : `${filename.substring(0, nameInd)}.${extension}`;

    if (exportAsMp4) {
      setIsTranscoding(true);
      const blobBuffer = new Uint8Array(await blob.arrayBuffer());
      const output = await transcode(blobBuffer, isDeveloper);
      downloadData(output, outputName);
    } else {
      downloadData(blob, outputName);
    }

    setIsTranscoding(false);
    restoreMapPriorToRecording();
  };

  function restoreMapPriorToRecording() {
    if (savedMapStateRef.current) {
      const eu4Map = getEu4Map(canvasContext.eu4CanvasRef);
      const eu4Canvas = getEu4Canvas(canvasContext.eu4CanvasRef);

      canvasContext.sizeOverrideRef.current = false;
      eu4Map.focusPoint = savedMapStateRef.current.focusPoint;
      eu4Map.scale = savedMapStateRef.current.scale;
      eu4Canvas.resize(
        savedMapStateRef.current.width,
        savedMapStateRef.current.height
      );
      eu4Canvas.redrawViewport();
      savedMapStateRef.current = undefined;
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 justify-center">
        <Tooltip title={!isPlaying ? "Start timelapse" : "Stop timelapse"}>
          <Button
            shape="circle"
            icon={!isPlaying ? <CaretRightOutlined /> : <PauseOutlined />}
            onClick={!isPlaying ? startTimelapse : stopTimelapseWithSync}
          />
        </Tooltip>
        <Tooltip title={!isPlaying ? "Start recording" : "Stop recording"}>
          <Button
            shape="circle"
            loading={isTranscoding}
            icon={
              !isRecording ? <VideoCameraOutlined /> : <VideoCameraTwoTone />
            }
            onClick={!isRecording ? startRecording : stopRecordingWithSync}
          />
        </Tooltip>
      </div>
      <Form
        form={form}
        layout="vertical"
        onFieldsChange={(_e, x) => {
          const find = (field: string) =>
            x.find((prop) => Array.isArray(prop.name) && prop.name[0] == field)
              ?.value;

          setIntervalSelection(find("interval"));
          setRecordingFrame(find("frame"));
          setMaxFps(+find("maxFps"));
        }}
        initialValues={{
          interval: intervalSelection,
          frame: recordingFrame,
          maxFps,
        }}
      >
        <Form.Item label="Interval" name="interval">
          <Radio.Group
            optionType="button"
            options={[
              {
                label: "Year",
                value: "Year",
              },
              {
                label: "Month",
                value: "Month",
              },
              {
                label: "Week",
                value: "Week",
              },
              {
                label: "Day",
                value: "Day",
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="Max intervals per second"
          name="maxFps"
          tooltip="The number of intervals to step through per second. A beefy computer may be required to hit more than 8 intervals per second."
        >
          <Slider
            min={4}
            max={16}
            marks={{ 4: "4", 8: "8", 12: "12", 16: "16" }}
          />
        </Form.Item>
        <Form.Item
          label="Recording Frame"
          name="frame"
          tooltip="Determines the size of the map for recording. 'None' will record the current view in the browser. The other numerical options represent the zoom level of the map and will temporarily resize the map so that the entire map is visible at the zoom level. The 2x zoom level is recommended as a good mix between quality and render times."
        >
          <Radio.Group
            optionType="button"
            options={[
              {
                label: "None",
                value: "None",
              },
              {
                label: "8x",
                value: "8x",
              },
              {
                label: "4x",
                value: "4x",
              },
              {
                label: "2x",
                value: "2x",
              },
              {
                label: "1x",
                value: "1x",
              },
            ]}
          />
        </Form.Item>
      </Form>
      <Row className="flex items-center">
        <Col span={4}>
          <InputNumber
            min={0}
            max={8}
            defaultValue={0}
            value={freezeFrameSeconds}
            onChange={setFreezeFrameSeconds}
            style={{ width: "calc(100% - 5px)" }}
          />
        </Col>
        <Col span={24 - 4}>Seconds of final freeze frame</Col>
      </Row>

      <ToggleRow
        text="Sync recording with timelapse"
        onChange={setSyncRecording}
        value={syncRecording}
        help="Synchronizes the recording with the timelapse such that when a recording starts the timelapse starts too and each continue until one or the other stops"
      />
      <ToggleRow
        text="Export as MP4 (slow)"
        onChange={setExportAsMp4}
        value={exportAsMp4}
        help="After the recording is finished, it will be transcoded into an mp4. May take several minutes"
      />
    </>
  );
};
