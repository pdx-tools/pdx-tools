/**
 * Encodes a campaign timelapse into a file a player can post.
 *
 * Each frame is the rendered map on the recording surface; this composes it
 * into the output frame — matte, map, date — and hands it to the platform's
 * video encoder. MP4 is asked for first, because that is what Reddit and
 * Discord play inline, with WebM as the fallback when a browser cannot
 * produce H.264.
 *
 * The encoder lives in the map worker, next to the surface it reads, so no
 * frame crosses a thread and the page's own thread is free to paint the
 * progress. Nothing here touches the document: the colors and fonts the
 * plate needs are read on the page and passed in.
 */

import {
  Output,
  WebMOutputFormat,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
} from "mediabunny";
import type { VideoCodec } from "mediabunny";
import type { DateComponents, TimelapseFrameLayout } from "./frame";
import { repairAvcDescription } from "./avc";
import { TIMELAPSE_FPS, timelapseBitrate } from "./options";
import { drawDatePlate, loadDatePlateFonts } from "./datePlate";
import type { DatePlateColors, DatePlateFonts } from "./datePlate";

export type VideoEncoding = "mp4" | "webm";

/** A finished recording, ready to download. */
export type TimelapseFile = { blob: Blob; extension: VideoEncoding };

/** How long a frame took to render and to encode, for the timing summary. */
export type TimelapseFrameTiming = { renderMs: number; encodeMs: number };

/** Where the encoder reports what it chose and what it skipped. */
export type TimelapseLog = (message: string) => void;

/** Black: the map renderer clears to it, so the matte and the map's void match. */
const MATTE = "#000000";

/** A key frame every five seconds keeps seeking responsive without bloat. */
const KEY_FRAME_INTERVAL = TIMELAPSE_FPS * 5;

/**
 * How many frames may sit in the encoder before the caller waits for it.
 * The wait is for the encoder to take a frame, never a flush: a flush drains
 * the whole pipeline, and on a hardware encoder that is hundreds of
 * milliseconds in which the film on screen stands still.
 */
const QUEUE_DEPTH = 6;

const MP4_CODECS = [["avc1.424034", "avc"]] as const;
const WEBM_CODECS = [
  ["vp09.00.10.08", "vp9"],
  ["vp8", "vp8"],
] as const;

export class TimelapseEncoder {
  private encoder: VideoEncoder;
  private error: DOMException | undefined;
  private timestamp = 0;
  private frameCount = 0;
  private pendingAdds: Promise<void>[] = [];
  /** Ends a wait on the encoder's queue, so a failure does not leave it hanging. */
  private wake: (() => void) | null = null;

  private constructor(
    config: VideoEncoderConfig,
    private output: Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget>,
    private videoSource: EncodedVideoPacketSource,
    private ctx2d: OffscreenCanvasRenderingContext2D,
    private layout: TimelapseFrameLayout,
    private colors: DatePlateColors,
    private fonts: DatePlateFonts,
    readonly extension: VideoEncoding,
    private log: TimelapseLog,
  ) {
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        this.pendingAdds.push(this.videoSource.add(packet, this.repairMetadata(meta)));
      },
      error: (e) => {
        this.error = e;
        this.wake?.();
      },
    });
    this.encoder.configure(config);
  }

  /**
   * The muxer writes the decoder description as the browser gives it, so a
   * browser that writes it wrong (see `repairAvcDescription`) is corrected
   * here, before the record reaches the file.
   */
  private repairMetadata(meta: EncodedVideoChunkMetadata | undefined) {
    const decoderConfig = meta?.decoderConfig;
    if (this.extension !== "mp4" || decoderConfig?.description === undefined) return meta;
    const repaired = repairAvcDescription(decoderConfig.description);
    if (repaired === decoderConfig.description) return meta;
    this.log("Repaired a doubled NAL header in the H.264 decoder description");
    return { ...meta, decoderConfig: { ...decoderConfig, description: repaired } };
  }

  /**
   * Compose and encode one frame from `surface`, the recording surface as
   * rendered for `date`. Returns how long that took, for the timing summary.
   */
  async addFrame(surface: OffscreenCanvas, date: DateComponents): Promise<number> {
    this.throwIfFailed();

    const start = performance.now();
    const { offset, band } = this.layout;
    const ctx = this.ctx2d;
    ctx.drawImage(surface, offset.x, offset.y, band.width, band.height);

    drawDatePlate({
      ctx,
      date,
      scale: ctx.canvas.height / 1080,
      colors: this.colors,
      fonts: this.fonts,
      bandBottom: offset.y + band.height,
      matte: MATTE,
    });

    const duration = 1_000_000 / TIMELAPSE_FPS; // microseconds
    const frame = new VideoFrame(ctx.canvas, {
      timestamp: this.timestamp,
      duration,
    });

    this.encoder.encode(frame, {
      keyFrame: this.frameCount % KEY_FRAME_INTERVAL === 0,
    });
    frame.close();

    this.frameCount += 1;
    this.timestamp += duration;

    // Let the encoder catch up rather than holding every frame in memory.
    while (this.encoder.encodeQueueSize > QUEUE_DEPTH) {
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.encoder.addEventListener("dequeue", () => resolve(), { once: true });
      });
      this.wake = null;
      this.throwIfFailed();
    }
    return performance.now() - start;
  }

  /** The encoder reports a failure on its own callback; surface it where a frame is added. */
  private throwIfFailed(): void {
    if (this.error) {
      throw new Error(this.error.message);
    }
  }

  async finish(): Promise<Blob> {
    await this.encoder.flush();
    await Promise.all(this.pendingAdds);
    this.encoder.close();
    this.videoSource.close();
    await this.output.finalize();

    const buffer = this.output.target.buffer;
    if (buffer === null) {
      throw new Error("Expected the recording to produce a file");
    }
    return new Blob([buffer], { type: this.output.format.mimeType });
  }

  /** Release the encoder without producing a file, after a cancelled recording. */
  async abort() {
    try {
      this.encoder.close();
      this.videoSource.close();
      await this.output.cancel();
    } catch (e) {
      this.log(`Ignoring error while discarding a cancelled timelapse: ${e}`);
    }
  }

  static async create({
    layout,
    output,
    colors,
    fonts,
    log = () => {},
  }: {
    layout: TimelapseFrameLayout;
    output: { width: number; height: number };
    colors: DatePlateColors;
    fonts: DatePlateFonts;
    log?: TimelapseLog;
  }): Promise<TimelapseEncoder> {
    // H.264 encodes even dimensions only.
    const width = 2 * Math.round(output.width / 2);
    const height = 2 * Math.round(output.height / 2);
    const bitrate = timelapseBitrate({ width, height });
    log(`timelapse bitrate: ${Math.round(bitrate / 1000)}kbps`);

    const findEncoder = async (codecs: Readonly<Readonly<[string, string]>[]>) => {
      for (const [codec, muxCodec] of codecs) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec,
            width,
            height,
            bitrate,
            bitrateMode: "variable",
            framerate: TIMELAPSE_FPS,
            latencyMode: "quality",
          });
          if (support.config) return { config: support.config, muxCodec };
        } catch (e) {
          log(`Skipping unsupported timelapse codec ${codec}: ${e}`);
        }
      }
      return null;
    };

    const mp4 = await findEncoder(MP4_CODECS);
    const chosen = mp4 ?? (await findEncoder(WEBM_CODECS));
    if (chosen === null) {
      throw new Error("This browser has no video encoder the map can record with");
    }
    const encoding: VideoEncoding = mp4 !== null ? "mp4" : "webm";

    // No transparency: the map is opaque, and the copy is faster without it.
    const canvas = new OffscreenCanvas(width, height);
    const ctx2d = canvas.getContext("2d", { alpha: false });
    if (ctx2d === null) {
      throw new Error("Failed to get a 2D context for the recording canvas");
    }

    // The matte is painted once. Every frame draws the map over the same
    // rectangle, so what is left of it never changes.
    ctx2d.fillStyle = MATTE;
    ctx2d.fillRect(0, 0, width, height);

    const format =
      encoding === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat();
    const videoOutput = new Output({ format, target: new BufferTarget() });
    const videoSource = new EncodedVideoPacketSource(chosen.muxCodec as VideoCodec);
    videoOutput.addVideoTrack(videoSource);
    await videoOutput.start();

    // The worker's font set. The DOM typings this module compiles against
    // know only the document's, so the global is named by hand.
    const { fonts: fontSet } = self as unknown as { fonts: FontFaceSet };
    await loadDatePlateFonts(fontSet, fonts);

    return new TimelapseEncoder(
      chosen.config,
      videoOutput,
      videoSource,
      ctx2d,
      layout,
      colors,
      fonts,
      encoding,
      log,
    );
  }
}
