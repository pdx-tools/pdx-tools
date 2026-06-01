export const mediaOrigin = import.meta.env.VITE_MEDIA_ORIGIN;

// Production reads bypass the Worker through the R2 custom domain. Dev and test
// builds omit VITE_MEDIA_ORIGIN and use the local MEDIA_BUCKET Worker route.
export const ogImageUrl = (saveId: string, game = "eu4") =>
  mediaOrigin ? `${mediaOrigin}/${game}/og/${saveId}.webp` : `/${game}/saves/${saveId}/og`;
