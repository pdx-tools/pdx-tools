import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Button,
  Radio,
  Tooltip,
  Form,
  InputNumber,
  Modal,
  Row,
  Col,
  Slider,
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
  getEu4Canvas,
  useCanvasContext,
  selectAnalyzeFileName,
} from "@/features/engine";
import {
  initialEu4CountryFilter,
  selectEu4MapColorPayload,
  selectEu4MapDate,
  setMapDate,
  useEu4Meta,
} from "../../eu4Slice";
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH } from "@/map/map";
import { selectIsDeveloper } from "@/features/account";
import { dates, TimelapseEncoder } from "./TimelapseEncoder";
import { transcode } from "./WebMTranscoder";
import { useAppSelector } from "@/lib/store";
import Link from "next/link";
import { captureException } from "@/features/errors";

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
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [recordingFrame, setRecordingFrame] = useState("None");
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(false);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<
    "Year" | "Month" | "Week" | "Day"
  >("Year");
  const currentMapDate = useSelector(selectEu4MapDate);
  const canvasContext = useCanvasContext();
  const [form] = Form.useForm();
  const mapControls = useAppSelector((x) => x.eu4.mapControls);
  const isDeveloper = useSelector(selectIsDeveloper);
  const filename = useSelector(selectAnalyzeFileName);
  const payload = useSelector(selectEu4MapColorPayload);
  const encoderRef = useRef<TimelapseEncoder | undefined>(undefined);
  const stopTimelapseReq = useRef<boolean>(false);
  const [recordingSupported] = useState(() => TimelapseEncoder.isSupported());
  const [progress, setProgress] = useState("");
  const timelapseEnabled =
    payload.kind === "political" || payload.kind === "religion";

  const startTimelapseDate = () =>
    currentMapDate.days == meta.total_days
      ? {
          days: 0,
          text: meta.start_date,
        }
      : currentMapDate;

  const startTimelapse = async () => {
    setIsPlaying(true);
    stopTimelapseReq.current = false;

    const worker = getWasmWorker(workerRef);
    const startDate = startTimelapseDate();
    const endDate = { days: meta.total_days, text: meta.date };
    for await (const date of dates(
      worker,
      startDate,
      endDate,
      intervalSelection
    )) {
      dispatch(setMapDate(date));

      await new Promise((res) => setTimeout(res, 1000 / maxFps));
      if (stopTimelapseReq.current) {
        break;
      }
    }

    setIsPlaying(false);
  };

  const stopTimelapse = () => {
    stopTimelapseReq.current = true;
    stopRecording();
  };

  const startRecording = async () => {
    setIsRecording(true);

    const eu4Canvas = getEu4Canvas(canvasContext.eu4CanvasRef);
    const eu4Map = getEu4Map(canvasContext.eu4CanvasRef);
    let savedMapStateRef: MapState | undefined;
    if (recordingFrame !== "None") {
      const zoom = recordingFrame.charCodeAt(0) - "0".charCodeAt(0);

      savedMapStateRef = {
        width: eu4Canvas.webglContext().canvas.width,
        height: eu4Canvas.webglContext().canvas.height,
        focusPoint: eu4Map.focusPoint,
        scale: eu4Map.scale,
      };

      canvasContext.sizeOverrideRef.current = true;
      eu4Canvas.webglContext().canvas.style.removeProperty("max-width");
      eu4Canvas;
      eu4Map.focusPoint = [0, 0];
      eu4Map.scale = 1;
      eu4Canvas.resize(IMG_WIDTH / zoom, IMG_HEIGHT / zoom);
      eu4Canvas.redrawViewport();
    }

    const restoreMapState = () => {
      eu4Canvas.webglContext().canvas.style.setProperty("max-width", "100%");
      if (savedMapStateRef) {
        canvasContext.sizeOverrideRef.current = false;
        eu4Map.focusPoint = savedMapStateRef.focusPoint;
        eu4Map.scale = savedMapStateRef.scale;
        eu4Canvas.resize(savedMapStateRef.width, savedMapStateRef.height);
        savedMapStateRef = undefined;
      }
    };

    eu4Canvas.setControls({
      ...mapControls,
      showCountryBorders: false,
      showMapModeBorders: false,
      showProvinceBorders: true,
    });

    try {
      const encoder = await TimelapseEncoder.create({
        canvas: getEu4Canvas(canvasContext.eu4CanvasRef),
        worker: getWasmWorker(workerRef),
        fps: maxFps,
        interval: intervalSelection,
        startDate: startTimelapseDate(),
        endDate: { days: meta.total_days, text: meta.date },
        mapPayload: {
          ...payload,
          showSecondaryColor: payload.kind == "religion",
          tagFilter: initialEu4CountryFilter,
        },
        freezeFrame: freezeFrameSeconds,
      });
      encoderRef.current = encoder;

      for await (const date of encoder.timelapse()) {
        setProgress(`recording: ${date.text}`);
      }

      const out = encoder.finish();
      const blob = new Blob([out], {
        type: exportAsMp4 ? "video/mp4" : "video/webm",
      });

      const extension = exportAsMp4 ? "mp4" : "webm";
      const nameInd = filename.lastIndexOf(".");
      const outputName =
        nameInd == -1
          ? `${filename}.${extension}`
          : `${filename.substring(0, nameInd)}.${extension}`;

      setIsRecording(false);
      restoreMapState();

      eu4Canvas.setControls(mapControls);
      const [primary, secondary] = await getWasmWorker(workerRef).eu4MapColors(
        payload
      );
      eu4Canvas.map?.updateProvinceColors(primary, secondary);
      eu4Canvas.redrawMapNow();

      if (exportAsMp4) {
        setProgress("transcoding into MP4");
        setIsTranscoding(true);
        const blobBuffer = new Uint8Array(out);
        const output = await transcode(blobBuffer, isDeveloper);
        downloadData(output, outputName);
      } else {
        downloadData(blob, outputName);
      }
    } catch (ex) {
      captureException(ex);
      Modal.error({
        title: "The timelapse engine encountered an error",
        content: `${ex}`,
      });
    } finally {
      restoreMapState();
      setProgress("");
      setIsTranscoding(false);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    encoderRef.current?.stop();
  };

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <Tooltip title={!isPlaying ? "Start timelapse" : "Stop timelapse"}>
          <Button
            shape="circle"
            icon={!isPlaying ? <CaretRightOutlined /> : <PauseOutlined />}
            onClick={!isPlaying ? startTimelapse : stopTimelapse}
            disabled={!timelapseEnabled}
          />
        </Tooltip>
        <Tooltip title={!isPlaying ? "Start recording" : "Stop recording"}>
          <Button
            shape="circle"
            loading={isTranscoding}
            disabled={!(timelapseEnabled && recordingSupported)}
            icon={
              !isRecording ? <VideoCameraOutlined /> : <VideoCameraTwoTone />
            }
            onClick={!isRecording ? startRecording : stopRecording}
          />
        </Tooltip>
      </div>
      {!recordingSupported && (
        <Alert
          type="info"
          message={
            <>
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
            </>
          }
        />
      )}
      {progress && <Alert type="info" message={progress} />}
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
          tooltip="The number of intervals to step through per second."
        >
          <Slider
            min={5}
            max={30}
            marks={{ 5: "5", 10: "10", 15: "15", 20: "20", 25: "25", 30: "30" }}
          />
        </Form.Item>
        {recordingSupported && (
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
              ]}
            />
          </Form.Item>
        )}
      </Form>
      {recordingSupported && (
        <Row className="flex items-center">
          <Col span={4}>
            <InputNumber
              min={0}
              max={8}
              defaultValue={0}
              value={freezeFrameSeconds}
              onChange={(x) => setFreezeFrameSeconds(x ?? 0)}
              style={{ width: "calc(100% - 5px)" }}
            />
          </Col>
          <Col span={24 - 4}>Seconds of final freeze frame</Col>
        </Row>
      )}

      {recordingSupported && (
        <ToggleRow
          text="Export as MP4 (slow)"
          onChange={setExportAsMp4}
          value={exportAsMp4}
          help="After the recording is finished, it will be transcoded into an mp4. May take several minutes"
        />
      )}
    </>
  );
};
