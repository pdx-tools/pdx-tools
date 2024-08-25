import React from "react";
import Image from "next/image";
import map from "./gallery-map.webp";
import terrain from "./terrain.webp";
import countryDark from "./country-dark.webp";
import countryLight from "./country-light.webp";
import worldDark from "./world-dark.webp";
import worldLight from "./world-light.webp";
import video from "./gallery-video.mp4";
import videoPoster from "./video-poster.png";
import videoHotspot from "./ming.mp4";
import advisor from "./gallery-advisor.png";
import mana from "./gallery-mana.png";
import graphs from "./gallery-graphs.png";
import insights from "./gallery-insights.png";
import styles from "./ImageGallery.module.css";
import { cx } from "class-variance-authority";
import { MapPinIcon } from "@heroicons/react/24/outline";
import { Popover } from "../Popover";
import { Button } from "../Button";
import { VideoCameraIcon } from "@heroicons/react/24/solid";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const images = [
  {
    src: map,
    alt: "PDX Tools map of a save file",
    title: "Interactive Map",
    description:
      "Pan, zoom, and select provinces, as if EU4 was played within Google Maps",
  },
  {
    src: graphs,
    mobile: mana,
    alt: "Visualizations of a save that PDX Tools provides",
    title: "Graphs",
    description:
      "Breakdown a country's mana expense and budget or view the historical ledger",
  },
  {
    src: insights,
    mobile: advisor,
    alt: "Screenshot showing map and graph",
    title: "Insights",
    description: "Uncover data not easily exposed in-game",
  },
  {
    src: video,
    alt: "Religion mode timelapse",
    title: "Timelapses",
    description:
      "Relive your campaign by creating and watching detailed timelapses",
  },
];

let showHotspots = false;
const DesktopImageGallery = () => {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLImageElement>({
    threshold: 0.75,
  });

  showHotspots ||= isIntersecting;
  const hitBreakpoint = useBreakpoint("xl");

  return (
    <div className="relative max-w-7xl">
      <Image
        ref={ref}
        src={images[0].src}
        className="rounded-t-3xl shadow-xl"
        width={1920}
        height={1080}
        alt=""
        priority
      />

      {hitBreakpoint && showHotspots && (
        <>
          <Popover>
            <Popover.Trigger asChild>
              <HotspotButton
                className={cx(styles["hotspot"], styles["hotspot-1"])}
              >
                <MapPinIcon className="h-8 w-8 stroke-slate-800 stroke-2" />
              </HotspotButton>
            </Popover.Trigger>
            <Popover.Content sideOffset={7} className="max-w-xs">
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <div className="p-4">
                <h3 className="text-lg font-semibold tracking-tight">
                  Interactive Map
                </h3>
                <p>
                  Pan, zoom, and select provinces, as if EU4 was played within
                  Google Maps. Activate terrain overlay for added depth!
                </p>
              </div>
              <Image
                src={terrain}
                width={320}
                height={180}
                alt=""
                className="rounded-b-md"
              />
            </Popover.Content>
          </Popover>

          <Popover>
            <Popover.Trigger asChild>
              <HotspotCircle className={cx("h-12 w-12", styles["hotspot-2"])} />
            </Popover.Trigger>
            <Popover.Content
              sideOffset={7}
              side="left"
              className="max-w-xs p-4"
            >
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <h3 className="text-lg font-semibold tracking-tight">
                Save info
              </h3>
              <p>View completed achievements</p>
              <p>
                Melt (convert) ironman and binary saves into normal saves to
                continue the save in-game without ironman restrictions
              </p>
            </Popover.Content>
          </Popover>
          <Popover>
            <Popover.Trigger asChild>
              <HotspotCircle className={cx("h-12 w-12", styles["hotspot-3"])} />
            </Popover.Trigger>
            <Popover.Content
              sideOffset={7}
              side="left"
              className="max-w-xs p-4"
            >
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <h3 className="text-lg font-semibold tracking-tight">
                Upload save
              </h3>
              <p>
                Upload your save to share with others or compete in achievement
                leaderboards!
              </p>
            </Popover.Content>
          </Popover>
          <Popover>
            <Popover.Trigger asChild>
              <HotspotCircle className={cx("h-12 w-12", styles["hotspot-4"])} />
            </Popover.Trigger>
            <Popover.Content sideOffset={7} side="left" className="max-w-xs">
              <Popover.Arrow className="fill-white dark:fill-slate-800" />

              <div className="p-4">
                <h3 className="text-lg font-semibold tracking-tight">
                  World charts
                </h3>
                <p>
                  See how nations stack up against one another across a variety
                  of metrics: development efficiency, wars, income, and many
                  more. Export data and create your own graphics!
                </p>
              </div>
              <picture className="rounded-b-md">
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet={worldDark}
                />
                <source
                  media="(prefers-color-scheme: light)"
                  srcSet={worldLight}
                />
                <img src={worldLight} width="759" height="531" alt="" />
              </picture>
            </Popover.Content>
          </Popover>
          <Popover>
            <Popover.Trigger asChild>
              <HotspotCircle className={cx("h-12 w-12", styles["hotspot-5"])} />
            </Popover.Trigger>
            <Popover.Content
              sideOffset={7}
              side="left"
              className="max-w-xs p-4"
            >
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <h3 className="text-lg font-semibold tracking-tight">
                Country breakdown
              </h3>
              <p className="pb-2">
                Drill into a country's diplomatic stance, relive their rich
                history, and see where ducats and mana were spent. Optimize
                institution dev pushing and great advisor events.
              </p>

              <picture>
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet={countryDark}
                />
                <source
                  media="(prefers-color-scheme: light)"
                  srcSet={countryLight}
                />
                <img src={countryLight} width="800" height="600" alt="" />
              </picture>
            </Popover.Content>
          </Popover>
          <Popover>
            <Popover.Trigger asChild>
              <HotspotCircle className={cx("h-12 w-12", styles["hotspot-6"])} />
            </Popover.Trigger>
            <Popover.Content
              side="left"
              sideOffset={7}
              className="max-w-xs p-4"
            >
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <h3 className="text-lg font-semibold tracking-tight">
                Watch your save for changes
              </h3>
              <p>
                Play EU4 in the background and watch as charts, maps, and
                computations within pdx.tools update when the game saves.
              </p>
            </Popover.Content>
          </Popover>

          <Popover>
            <Popover.Trigger asChild>
              <HotspotButton className={cx(styles["hotspot-7"])}>
                <VideoCameraIcon className="h-8 w-8 text-slate-800" />
              </HotspotButton>
            </Popover.Trigger>
            <Popover.Content sideOffset={7} side="top" className="max-w-xs">
              <Popover.Arrow className="fill-white dark:fill-slate-800" />
              <div className="p-4">
                <h3 className="text-lg font-semibold tracking-tight">
                  Timelapses
                </h3>
                <p>
                  Watch and export timelapses that are more detailed and
                  accurate than EU4's. Timelapses include: political, religious,
                  and battles.
                </p>
              </div>
              <video
                className="w-full"
                src={videoHotspot}
                autoPlay
                loop
                playsInline
                muted
              />
            </Popover.Content>
          </Popover>
        </>
      )}
    </div>
  );
};

const MobileImageGallery = () => {
  return (
    <div className="grid gap-28">
      {images.map((x) => {
        return (
          <div className="grid gap-4" key={x.src}>
            <h2 className="text-2xl font-semibold tracking-tight">{x.title}</h2>
            <p>{x.description}</p>
            {x.src.endsWith("mp4") ? (
              <video
                className="aspect-video w-full shadow-xl"
                src={x.src}
                poster={videoPoster}
                preload="none"
                controls
                loop
                muted
              />
            ) : (
              <Image
                src={x.mobile ?? x.src}
                className="shadow-xl"
                loading="lazy"
                width={1920}
                height={1080}
                alt={x.alt}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const HotspotButton = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithChildren<{ className?: string }>
>(function HotspotButton({ className, children, ...rest }, ref) {
  return (
    <Button
      {...rest}
      ref={ref}
      shape="circle"
      variant="ghost"
      className={cx(
        "absolute overflow-hidden bg-white opacity-0 shadow-lg outline outline-4 outline-slate-800 focus-visible:bg-slate-200 enabled:hover:bg-slate-200 enabled:active:bg-slate-300",
        styles["anim"],
        className,
      )}
    >
      {children}
    </Button>
  );
});

const HotspotCircle = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithChildren<{ className?: string }>
>(function HotspotButton2({ className, children, ...rest }, ref) {
  return (
    <Button
      {...rest}
      ref={ref}
      shape="circle"
      variant="ghost"
      className={cx(
        "absolute overflow-hidden bg-transparent opacity-0 outline outline-4 outline-slate-200 focus-visible:outline-slate-400 enabled:hover:outline-slate-400 enabled:active:outline-slate-500",
        styles["anim"],
        className,
      )}
    >
      {children}
    </Button>
  );
});

export const ImageGallery = () => {
  return (
    <>
      <div className="hidden lg:block">
        <DesktopImageGallery />
      </div>
      <div className="lg:hidden">
        <MobileImageGallery />
      </div>
    </>
  );
};
