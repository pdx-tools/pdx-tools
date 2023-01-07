import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegModule: Promise<FFmpeg> | undefined = undefined;

export async function transcode(webmInput: Uint8Array, isDeveloper: boolean) {
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
