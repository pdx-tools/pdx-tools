import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";
import { DiscordIcon, RedditIcon } from "@/components/icons";
import { cx } from "class-variance-authority";
import { formatInt } from "@/lib/format";
import { communityQuotes, creatorSpotlights } from "./creatorSpotlights";
import type { CreatorSpotlight } from "./creatorSpotlights";

// The reel's row has no horizontal padding, so the strip runs to the viewport
// edge and pads itself to line its first frame up with the max-w-7xl page
// container (px-5 md:px-9 gutters, as the other rows in Home.tsx use).
const gutter = "px-[max(1.25rem,calc((100%-80rem)/2))] md:px-[max(2.25rem,calc((100%-80rem)/2))]";
// Snap positions must use the same gutter, or the first frame rests off the axis.
const snapGutter =
  "scroll-px-[max(1.25rem,calc((100%-80rem)/2))] md:scroll-px-[max(2.25rem,calc((100%-80rem)/2))]";

const Frame = ({ creator }: { creator: CreatorSpotlight }) => {
  return (
    <li className="w-[min(82vw,24rem)] shrink-0 snap-start md:w-[22rem] xl:w-[24rem]">
      <a
        href={creator.momentUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${creator.name} on ${creator.platform}: ${creator.videoTitle}, at ${creator.timecode}`}
        className="group relative block aspect-video overflow-hidden rounded-lg bg-slate-950 ring-1 ring-white/15 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-teal-900"
      >
        <img
          src={creator.still}
          alt={creator.alt}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: creator.stillPosition }}
          className="absolute inset-0 size-full object-cover transition duration-300 ease-out group-hover:scale-[1.03] group-hover:brightness-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <span className="absolute inset-0 grid place-items-center bg-slate-950/25 opacity-0 transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <span className="grid size-14 place-items-center rounded-full bg-white/90 text-slate-900 shadow-lg shadow-slate-950/40">
            <PlayIcon className="ml-1 size-7" aria-hidden />
          </span>
        </span>
        <span className="absolute bottom-2 left-2 flex items-center gap-2 rounded-full bg-slate-950/80 py-1 pr-3 pl-1 text-sm font-semibold text-white backdrop-blur-sm">
          <img
            src={creator.avatar}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="size-7 rounded-full bg-slate-800"
          />
          {creator.name}
        </span>
        <span className="absolute right-2 bottom-2 rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-xs text-white tabular-nums backdrop-blur-sm">
          {creator.timecode}
        </span>
      </a>
    </li>
  );
};

export const CreatorReel = () => {
  const stripRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const slack = 4;
    setEdges({
      start: strip.scrollLeft <= slack,
      end: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - slack,
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const step = (direction: -1 | 1) => {
    const strip = stripRef.current;
    const frame = strip?.querySelector("li");
    if (!strip || !frame) return;
    const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
    strip.scrollBy({ left: direction * (frame.offsetWidth + gap), behavior: "smooth" });
  };

  const arrow =
    "grid size-11 place-items-center rounded-full border border-white/30 text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="w-full">
      <div className={gutter}>
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-8">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight xl:text-4xl">
              <span className="block tracking-widest sm:mr-2 sm:inline">{formatInt(1000000)}+</span>{" "}
              saves analyzed
            </h2>
            <p className="mt-2 text-xl text-teal-100/90">Used by the best</p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              className={arrow}
              onClick={() => step(-1)}
              disabled={edges.start}
              aria-label="Show previous creators"
            >
              <ChevronLeftIcon className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              className={arrow}
              onClick={() => step(1)}
              disabled={edges.end}
              aria-label="Show more creators"
            >
              <ChevronRightIcon className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <ul
        ref={stripRef}
        onScroll={measure}
        aria-label="Creators using PDX Tools on stream"
        className={cx(
          "mt-8 flex snap-x snap-mandatory [scrollbar-width:thin] [scrollbar-color:var(--color-teal-600)_transparent] gap-5 overflow-x-auto pb-4",
          gutter,
          snapGutter,
        )}
      >
        {creatorSpotlights.map((creator) => (
          <Frame key={creator.id} creator={creator} />
        ))}
      </ul>

      <div className={cx("mt-8", gutter)}>
        <div className="mx-auto max-w-7xl">
          <ul aria-label="Community remarks" className="gap-x-4 sm:columns-2 lg:columns-3">
            {communityQuotes.map((item) => (
              <li
                key={item.quote}
                // Six quotes carry the point on a phone; the rest join at `sm`.
                className="mb-3 break-inside-avoid max-sm:nth-[n+7]:hidden"
              >
                <blockquote className="flex max-w-full items-start gap-3 rounded-2xl bg-white/10 px-4 py-2.5 text-base leading-snug text-white">
                  {item.source === "r/eu4" ? (
                    <RedditIcon
                      className="mt-0.5 size-5 shrink-0 text-white/70"
                      aria-label="Reddit"
                    />
                  ) : (
                    <DiscordIcon
                      className="mt-0.5 size-5 shrink-0 text-white/70"
                      aria-label="Discord"
                    />
                  )}
                  <span>“{item.quote}”</span>
                </blockquote>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
