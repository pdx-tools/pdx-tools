import map from "./gallery-map.png";
import mapThumbnail from "./gallery-map-thumbnail.png";
import video from "./gallery-video.mp4";
import videoThumbnail from "./video-thumbnail.png";
import advisor from "./gallery-advisor.png";
import mana from "./gallery-mana.png";
import graphs from "./gallery-graphs.png";
import graphsThumbnail from "./gallery-graphs-thumbnail.png";
import insights from "./gallery-insights.png";
import insightsThumbnail from "./gallery-insights-thumbnail.png";
import Image from "next/image";
import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../../tailwind.config.js";
const fullConfig = resolveConfig(tailwindConfig);

const images = [
  {
    src: map,
    thumbnail: mapThumbnail,
    alt: "PDX Tools map of a save file",
    title: "Interactive Map",
    description:
      "Pan, zoom, and select provinces, as if EU4 was played within Google Maps",
  },
  {
    src: graphs,
    thumbnail: graphsThumbnail,
    mobile: mana,
    alt: "Visualizations of a save that PDX Tools provides",
    title: "Graphs",
    description:
      "Breakdown a country's mana expense and budget or view the historical ledger",
  },
  {
    src: insights,
    thumbnail: insightsThumbnail,
    mobile: advisor,
    alt: "Screenshot showing map and graph",
    title: "Insights",
    description: "Uncover data not easily exposed in-game",
  },
  {
    src: video,
    alt: "Religion mode timelapse",
    thumbnail: videoThumbnail,
    title: "Timelapses",
    description:
      "Relive your campaign by creating and watching detailed timelapses",
  },
];

const DesktopImageGallery = () => {
  const [selected, setSelected] = useState<typeof images[number]>(images[0]);
  return (
    <div className="grid w-full max-w-7xl grid-cols-[150px_1fr] gap-5">
      <div className="flex flex-col gap-4">
        {images.map((x) => (
          <button
            className="m-0 rounded-xl border-0 bg-transparent p-0"
            key={x.src}
            onClick={() => setSelected(x)}
          >
            <Image
              src={x.thumbnail}
              className={
                "cursor-pointer rounded-xl border-4 border-solid transition duration-100 ease-in hover:border-teal-700 hover:opacity-100 " +
                (Object.is(x, selected)
                  ? "border-teal-700"
                  : "border-slate-400 opacity-80")
              }
              width={1920}
              height={1080}
              alt={`Select ${x.alt}`}
            />
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        <div className="mb-3 space-x-4">
          <h2 className="inline">{selected.title}</h2>
          <span>{selected.description}</span>
        </div>
        {selected.src.endsWith("mp4") ? (
          <video
            className="aspect-video w-full drop-shadow-xl"
            src={selected.src}
            autoPlay
            loop
            playsInline
            muted
          />
        ) : (
          <Image
            src={selected.src}
            className="drop-shadow-xl"
            width={1920}
            height={1080}
            alt={selected.alt}
          />
        )}
      </div>
    </div>
  );
};

const MobileImageGallery = () => {
  return (
    <div className="grid gap-28">
      {images.map((x) => {
        return (
          <div key={x.src}>
            <h2>{x.title}</h2>
            <p>{x.description}</p>
            {x.src.endsWith("mp4") ? (
              <video
                className="aspect-video w-full drop-shadow-xl"
                src={x.src}
                autoPlay
                loop
                playsInline
                muted
              />
            ) : (
              <Image
                src={x.mobile ?? x.src}
                className="drop-shadow-xl"
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

export const ImageGallery = () => {
  const screens = fullConfig.theme?.screens;
  const width = screens && "lg" in screens ? screens["lg"] : "1024px";
  const desktopGallery = useMediaQuery(`(min-width: ${width})`);

  if (desktopGallery) {
    return <DesktopImageGallery />;
  } else {
    return <MobileImageGallery />;
  }
};
