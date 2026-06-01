import type { AppLoadContext } from "react-router";

type Bucketed = {
  get: R2Bucket["get"];
  put: R2Bucket["put"];
  delete: (id: string) => Promise<void>;
};

// Object storage for saves and generated media (eg. OG images).
export const pdxStorage = ({
  context,
  game = "eu4",
}: {
  context: AppLoadContext;
  game?: string;
}): {
  saves: Bucketed;
  previews: Bucketed;
} => {
  const { SAVE_BUCKET, MEDIA_BUCKET } = context.cloudflare.env;
  const saveKey = (id: string) => `${game}/${id}`;
  const ogKey = (id: string) => `${game}/og/${id}.webp`;
  return {
    saves: {
      get: (id, options) => SAVE_BUCKET.get(saveKey(id), options),
      put: (id, value, options) => SAVE_BUCKET.put(saveKey(id), value, options),
      delete: (id) => SAVE_BUCKET.delete(saveKey(id)),
    },
    previews: {
      get: (id, options) => MEDIA_BUCKET.get(ogKey(id), options),
      put: (id, value, options) => MEDIA_BUCKET.put(ogKey(id), value, options),
      delete: (id) => MEDIA_BUCKET.delete(ogKey(id)),
    },
  };
};

export type PdxStorage = ReturnType<typeof pdxStorage>;
