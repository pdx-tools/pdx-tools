import {
  Muxer as WebMMuxer,
  ArrayBufferTarget as WebmTarget,
} from "webm-muxer";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { IMG_WIDTH, MapController, overlayDate } from "map";
import { Eu4Worker, getEu4Worker } from "../../worker";
import { Eu4Store } from "../../store";
import { log } from "@/lib/log";
import { formatInt } from "@/lib/format";

export async function* mapTimelapseCursor(
  ...args: Parameters<Eu4Worker["mapTimelapse"]>
) {
  const worker = getEu4Worker();
  await worker.mapTimelapse(...args);
  let item;
  while ((item = await worker.mapTimelapseNext()) != undefined) {
    yield item;
  }
}

type EncoderConfig = VideoEncoderConfig;
type VideoEncoding = "mp4" | "webm";

type TimelapseEncoderOptions = {
  map: MapController;
  fps: number;
  frames: ReturnType<typeof mapTimelapseCursor>;
  encoding: VideoEncoding;
  freezeFrame: number;
  store: Eu4Store;
};

export class TimelapseEncoder {
  private error: DOMException | undefined;
  private encoder: VideoEncoder;
  private timestamp: number = 0;
  private frameCount: number = 0;
  private stopRequested: boolean = false;
  private textMetrics: TextMetrics | undefined;

  private constructor(
    private map: MapController,
    config: EncoderConfig,
    private muxer:
      | { kind: "webm"; mux: WebMMuxer<WebmTarget> }
      | { kind: "mp4"; mux: Mp4Muxer<Mp4Target> },
    private ctx2d: CanvasRenderingContext2D,
    private frames: ReturnType<typeof mapTimelapseCursor>,
    private fontFamily: string,
    private fps: number,
    private freezeFrame: number,
    private store: Eu4Store,
  ) {
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.mux.addVideoChunk(chunk, meta ?? {}),
      error: (e) => (this.error = e),
    });

    this.encoder.configure(config);
  }

  create2dFrame(date: string) {
    const ctx2d = this.ctx2d;
    ctx2d.drawImage(this.map.canvas, 0, 0);

    const isScaled = Number.isInteger(IMG_WIDTH / ctx2d.canvas.width);
    const scale = !isScaled
      ? window.devicePixelRatio
      : (ctx2d.canvas.width / IMG_WIDTH) * 4;
    ctx2d.font = `700 ${20 * scale}px ${this.fontFamily}`;
    overlayDate({
      ctx2d,
      date,
      scale,
      textMetrics: (this.textMetrics ??= ctx2d.measureText(date)),
    });
  }

  async encodeTimelapse() {
    const frameDuration = 1_000_000 / this.fps; // microseconds

    for await (const item of this.frames) {
      if (this.error) {
        throw new Error(this.error.message);
      }

      if (this.stopRequested) {
        return;
      }

      this.store.getState().actions.updateMap(item);
      await this.map.redrawMap();
      this.create2dFrame(item.date.text);

      const frame = new VideoFrame(this.ctx2d.canvas, {
        timestamp: this.timestamp,
        duration: frameDuration,
      });

      this.encoder.encode(frame, {
        // https://github.com/Vanilagy/webm-muxer#video-key-frame-frequency
        keyFrame: (this.frameCount += 1) % 150 == 0,
      });

      frame.close();
      await this.encoder.flush();
      this.timestamp += frameDuration;
    }

    // For some reason the best quality freeze frame is if we encode it as
    // many small frame
    for (
      let t = this.timestamp;
      t < this.timestamp + this.freezeFrame * 1_000_000;
      t += frameDuration
    ) {
      const frame = new VideoFrame(this.ctx2d.canvas, {
        timestamp: t,
        duration: frameDuration,
      });

      this.encoder.encode(frame, {
        keyFrame: (this.frameCount += 1) % 150 == 0,
      });

      frame.close();
      await this.encoder.flush();
    }
  }

  stop() {
    this.stopRequested = true;
  }

  finish() {
    this.muxer.mux.finalize();
    const out = this.muxer.mux.target.buffer;
    if (out == null) {
      throw new Error("empty muxer");
    }
    this.encoder.close();

    return new Blob([out], {
      type: this.muxer.kind == "mp4" ? "video/mp4" : "video/webm",
    });
  }

  static isSupported() {
    return "VideoEncoder" in window;
  }

  static async create({
    map,
    frames,
    encoding,
    fps,
    freezeFrame,
    store,
  }: TimelapseEncoderOptions) {
    // H264 only supports even sized frames.
    const { height, width } =
      encoding == "mp4"
        ? {
            width: 2 * Math.round((map.canvas.width + 1) / 2),
            height: 2 * Math.round((map.canvas.height + 1) / 2),
          }
        : {
            width: map.canvas.width,
            height: map.canvas.height,
          };

    async function findSupportedEncoder(
      codecs: Readonly<Readonly<[string, string]>[]>,
    ) {
      for (const [codec, muxCodec] of codecs) {
        try {
          const canvasRate = recordingCanvas.height * recordingCanvas.width;
          const bitrate = canvasRate * (fps / 8);
          log(`calculated bitrate: ${formatInt(bitrate / 1000)}kbps`);
          const support = await VideoEncoder.isConfigSupported({
            codec: codec,
            height,
            width,
            bitrateMode: "variable",
            bitrate: Math.min(bitrate, 10_000_000),
            framerate: fps,
          });

          if (support.config) {
            return { config: support.config, muxCodec };
          }
        } catch (ex) {}
      }

      throw new Error("No supported codecs found");
    }

    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = width;
    recordingCanvas.height = height;

    const codecs =
      encoding == "mp4"
        ? ([["avc1.424034", "avc"]] as const)
        : ([
            ["vp09.00.10.08", "V_VP9"],
            ["vp8", "V_VP8"],
          ] as const);
    const { config, muxCodec } = await findSupportedEncoder(codecs);

    // get 2d context without alpha:
    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency
    const ctx2d = recordingCanvas.getContext("2d", { alpha: false });
    if (ctx2d === null) {
      throw new Error("expected recording canvas 2d contex to be defined");
    }

    const muxer =
      encoding == "mp4"
        ? ({
            kind: "mp4",
            mux: new Mp4Muxer({
              target: new Mp4Target(),
              fastStart: "in-memory",
              firstTimestampBehavior: "offset",
              video: {
                codec: "avc",
                width: ctx2d.canvas.width,
                height: ctx2d.canvas.height,
              },
            }),
          } as const)
        : ({
            kind: "webm",
            mux: new WebMMuxer({
              target: new WebmTarget(),
              firstTimestampBehavior: "offset",
              video: {
                codec: muxCodec,
                width: ctx2d.canvas.width,
                height: ctx2d.canvas.height,
              },
            }),
          } as const);

    const fontFamily = getComputedStyle(document.body).fontFamily;

    return new TimelapseEncoder(
      map,
      config,
      muxer,
      ctx2d,
      frames,
      fontFamily,
      fps,
      freezeFrame,
      store,
    );
  }
}
