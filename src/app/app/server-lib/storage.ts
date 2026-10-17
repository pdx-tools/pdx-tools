import { getCloudflare } from "./cloudflare-context";
import type { PdxRouteContext } from "./cloudflare-context";

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
  context: PdxRouteContext;
  game?: string;
}): {
  saves: Bucketed;
  previews: Bucketed;
} => {
  const env = getCloudflare(context).env;
  const saveBucket = () => required(env.SAVE_BUCKET, "SAVE_BUCKET");
  const mediaBucket = () => required(env.MEDIA_BUCKET, "MEDIA_BUCKET");
  const ogKey = (id: string) => `${game}/og/${id}.webp`;
  return {
    saves: {
      get: (id, options) => saveBucket().get(saveKey(game, id), options),
      put: (id, value, options) => saveBucket().put(saveKey(game, id), value, options),
      delete: (id) => saveBucket().delete(saveKey(game, id)),
    },
    previews: {
      get: (id, options) => mediaBucket().get(ogKey(id), options),
      put: (id, value, options) => mediaBucket().put(ogKey(id), value, options),
      delete: (id) => mediaBucket().delete(ogKey(id)),
    },
  };
};

export function saveKey(game: string, id: string) {
  return `${game}/${id}`;
}

// Previews omit some bindings. Check each binding when an operation needs it.
export function required<T>(binding: T | undefined, name: string): T {
  if (!binding) throw new Error(`${name} is not available in this environment`);
  return binding;
}

export type PdxStorage = ReturnType<typeof pdxStorage>;
