import { type PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: Cloudflare;
  };
};

export function getLoadContext({ context }: GetLoadContextArgs) {
  return context;
}
