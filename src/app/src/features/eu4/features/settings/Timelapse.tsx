import { useRef, useState } from "react";
import Link from "next/link";
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
import { downloadData } from "@/lib/downloadData";
import { ToggleRow } from "./ToggleRow";
import { IMG_HEIGHT, IMG_WIDTH } from "map";
import { useIsDeveloper } from "@/features/account";
import { mapTimelapseCursor, TimelapseEncoder } from "./TimelapseEncoder";
import { transcode } from "./WebMTranscoder";
import { captureException } from "@/features/errors";
import {
  useEu4Actions,
  useEu4Context,
  useEu4Map,
  useEu4MapMode,
  useIsDatePickerEnabled,
  useSaveFilename,
  useSelectedDate,
} from "../../store";

interface MapState {
  focusPoint: [number, number];
  scale: number;
  width: number;
  height: number;
}

export const Timelapse = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [recordingFrame, setRecordingFrame] = useState("None");
  const [maxFps, setMaxFps] = useState(8);
  const [exportAsMp4, setExportAsMp4] = useState(false);
  const [freezeFrameSeconds, setFreezeFrameSeconds] = useState(0);
  const [intervalSelection, setIntervalSelection] = useState<
    "year" | "month" | "week" | "day"
  >("year");
  const currentMapDate = useSelectedDate();
  const [form] = Form.useForm();
  const isDeveloper = useIsDeveloper();
  const filename = useSaveFilename();
  const encoderRef = useRef<TimelapseEncoder | undefined>(undefined);
  const stopTimelapseReq = useRef<boolean>(false);
  const [recordingSupported] = useState(() => TimelapseEncoder.isSupported());
  const [progress, setProgress] = useState("");
  const map = useEu4Map();
  const timelapseEnabled = useIsDatePickerEnabled();
  const { updateMap, updateProvinceColors } = useEu4Actions();
  const store = useEu4Context();
  const mapMode = useEu4MapMode();
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
      const encoder = await TimelapseEncoder.create({
        map,
        frames: mapTimelapseCursor(timelapsePayload),
        fps: maxFps,
        freezeFrame: freezeFrameSeconds,
        store,
      });
      encoderRef.current = encoder;

      await encoder.encodeTimelapse();
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

      await updateProvinceColors();
      map.redrawMapImage();

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
                value: "year",
              },
              {
                label: "Month",
                value: "month",
              },
              {
                label: "Week",
                value: "week",
              },
              {
                label: "Day",
                value: "day",
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
              options={["None", "8x", "4x", "2x"].map((x) => ({
                label: x,
                value: x,
              }))}
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
