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
  const saveKey = (id: string) => `${game}/${id}`;
  const ogKey = (id: string) => `${game}/og/${id}.webp`;
  return {
    saves: {
      get: (id, options) => saveBucket().get(saveKey(id), options),
      put: (id, value, options) => saveBucket().put(saveKey(id), value, options),
      delete: (id) => saveBucket().delete(saveKey(id)),
    },
    previews: {
      get: (id, options) => mediaBucket().get(ogKey(id), options),
      put: (id, value, options) => mediaBucket().put(ogKey(id), value, options),
      delete: (id) => mediaBucket().delete(ogKey(id)),
    },
  };
};

// Previews omit buckets. Check bindings only when an operation needs one.
function required(bucket: R2Bucket | undefined, name: string): R2Bucket {
  if (!bucket) throw new Error(`${name} is not available in this environment`);
  return bucket;
}

export type PdxStorage = ReturnType<typeof pdxStorage>;
