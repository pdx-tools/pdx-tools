import type { LinksFunction } from "react-router";

export const mediaOrigin = import.meta.env.VITE_MEDIA_ORIGIN;

export const ogImageSize = { width: 1200, height: 630 } as const;

// Production reads bypass the Worker through the R2 custom domain. Dev and test
// builds omit VITE_MEDIA_ORIGIN and use the local MEDIA_BUCKET Worker route.
export const ogImageUrl = (saveId: string, game = "eu4") =>
  mediaOrigin ? `${mediaOrigin}/${game}/og/${saveId}.webp` : `/${game}/saves/${saveId}/og`;

// Warm the connection to the media origin for routes that render OG images.
export const mediaPreconnectLinks: ReturnType<LinksFunction> = mediaOrigin
  ? [{ rel: "preconnect", href: mediaOrigin }]
  : [];
