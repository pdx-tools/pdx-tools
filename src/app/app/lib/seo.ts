import { ogImageSize } from "./media";

export function seo({
  title,
  description,
  image,
}: {
  title?: string;
  description?: string;
  image?: string;
}) {
  const titles = title ? [{ title }, { property: "og:title", content: title }] : [];

  const descriptions = description
    ? [
        { name: "description", content: description },
        { property: "og:description", content: description },
        { property: "twitter:description", content: description },
      ]
    : [];

  const images = image
    ? [
        { property: "twitter:card", content: "summary_large_image" },
        {
          property: "og:image",
          content: image.startsWith("http")
            ? image
            : `${import.meta.env.VITE_EXTERNAL_ADDRESS ?? ""}${image}`,
        },
        { property: "og:image:width", content: `${ogImageSize.width}` },
        { property: "og:image:height", content: `${ogImageSize.height}` },
      ]
    : [];

  return [...titles, ...descriptions, ...images];
}
