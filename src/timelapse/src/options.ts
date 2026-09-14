/**
 * What a player chooses before exporting, and what those choices cost.
 *
 * Two choices are asked: which part of the map the film shows, and how large
 * the picture is. The pace is not asked. A clip for a feed wants to be about
 * half a minute long, so the film is paced to land there; the panel states
 * the length and the size that follow, and nothing else the encoder needs is
 * put to the player.
 */

import type { TimelapseFraming } from "./frame";

/** Frame rate of every export. Smooth on a feed, cheap on bitrate. */
export const TIMELAPSE_FPS = 30;

/** Neither game's calendar has a leap day. */
const DAYS_PER_YEAR = 365;

/**
 * How long a film runs: long enough to read a campaign, short enough that a
 * feed plays it twice.
 */
export const TIMELAPSE_SECONDS = 30;

/**
 * The fastest the film advances in a short campaign. Past a year a second,
 * a decade of borders is gone before the eye lands on it, so a campaign
 * shorter than the target length plays at this pace and runs shorter.
 */
const MIN_YEARS_PER_SECOND = 1;

/**
 * The shortest film. A campaign of a few years still gets a clip that can be
 * watched, so it plays slower than a year a second to reach this length.
 */
export const MIN_TIMELAPSE_SECONDS = 10;

/**
 * Bits per pixel per frame the encoder is asked for.
 *
 * A political map is flat color with sharp edges, so it needs far less than
 * video of the world does; this is the rate at which borders stay crisp
 * without the file becoming unsharable.
 */
const BITS_PER_PIXEL = 0.035;

const MIN_BITRATE = 1_200_000;
const MAX_BITRATE = 8_000_000;

/**
 * Whether this browser can encode video at all. WebCodecs is what makes an
 * in-page recorder possible, and Safari and Firefox have been late to it.
 */
export function isTimelapseSupported(): boolean {
  return typeof VideoEncoder !== "undefined";
}

export type TimelapseQualityId = "1080p" | "720p";

export type TimelapseQuality = {
  id: TimelapseQualityId;
  label: string;
  width: number;
  height: number;
};

export const TIMELAPSE_QUALITIES: readonly TimelapseQuality[] = [
  { id: "1080p", label: "1080p", width: 1920, height: 1080 },
  { id: "720p", label: "720p", width: 1280, height: 720 },
];

export type TimelapseOptions = {
  framing: TimelapseFraming;
  quality: TimelapseQualityId;
};

export function timelapseQuality(id: TimelapseQualityId): TimelapseQuality {
  return TIMELAPSE_QUALITIES.find((q) => q.id === id) ?? TIMELAPSE_QUALITIES[0];
}

export function timelapseBitrate({ width, height }: { width: number; height: number }): number {
  const rate = width * height * TIMELAPSE_FPS * BITS_PER_PIXEL;
  return Math.round(Math.min(Math.max(rate, MIN_BITRATE), MAX_BITRATE));
}

/**
 * How long the film runs for a campaign of `totalDays`.
 *
 * The target length decides the pace, unless the campaign is so short that
 * the pace would drop under a year a second, when the film runs shorter
 * instead, down to the minimum length. Every film is between 10 and 30
 * seconds long.
 */
export function timelapseSeconds(totalDays: number): number {
  const years = totalDays / DAYS_PER_YEAR;
  return Math.min(TIMELAPSE_SECONDS, Math.max(MIN_TIMELAPSE_SECONDS, years / MIN_YEARS_PER_SECOND));
}

/** Campaign years the film advances each second. */
export function timelapseYearsPerSecond(totalDays: number): number {
  return totalDays / DAYS_PER_YEAR / timelapseSeconds(totalDays);
}

/**
 * The film's shape for a given campaign and set of choices: how many frames
 * it takes, how many campaign days each one advances, and what it will cost.
 *
 * The size is the encoder's target rate over the film's length. The encoder
 * works at a variable rate, so a film of a quiet century, where most frames
 * repeat the one before, lands under it; a film of a busy one lands near it.
 * It is an estimate to plan a post around, not a promise.
 */
export function timelapsePlan({
  totalDays,
  options,
}: {
  totalDays: number;
  options: TimelapseOptions;
}) {
  const quality = timelapseQuality(options.quality);
  const yearsPerSecond = timelapseYearsPerSecond(totalDays);
  const seconds = timelapseSeconds(totalDays);
  const frames = Math.max(2, Math.round(seconds * TIMELAPSE_FPS));
  const bitrate = timelapseBitrate(quality);

  return {
    quality,
    frames,
    yearsPerSecond,
    /** Campaign days between one frame and the next. Fractional: the dates round. */
    daysPerFrame: totalDays / (frames - 1),
    seconds: frames / TIMELAPSE_FPS,
    bytes: Math.round((bitrate / 8) * (frames / TIMELAPSE_FPS)),
  };
}

/** `0:24`, `1:08` — the duration as a player reads it off a video player. */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** `7.4 MB`, `940 KB` — megabytes as the upload dialog counts them. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

/** `377 years`, `1 year` — the span of campaign the film covers. */
export function formatCampaignSpan(totalDays: number): string {
  const years = Math.max(1, Math.round(totalDays / DAYS_PER_YEAR));
  return `${years} ${years === 1 ? "year" : "years"}`;
}
