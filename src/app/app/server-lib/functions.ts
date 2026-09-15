import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { googleIdToken } from "./google-auth";
import type { ParseResult } from "./save-parsing-types";
export type * from "./save-parsing-types";

export type ParseApiConfig = {
  /** Base URL of the Cloud Run api service. */
  endpoint: string;
  /**
   * Service-account key JSON with roles/run.invoker on the service. When
   * unset, requests go out unauthenticated (local dev against a local api).
   */
  serviceAccountKey?: string;
};

export const parseApiFromEnv = (
  env: Pick<CloudflareWorkerEnv, "PARSE_API_ENDPOINT" | "PARSE_API_SA_KEY">,
): ParseApiConfig => ({
  endpoint: env.PARSE_API_ENDPOINT,
  serviceAccountKey: env.PARSE_API_SA_KEY || undefined,
});

export const pdxFns = ({ endpoint, serviceAccountKey }: ParseApiConfig) => {
  // Cloud Run checks the token's `aud` against the service URL, so the
  // audience is the endpoint origin, not the full request URL.
  const authHeaders = async (): Promise<Record<string, string>> => {
    if (!serviceAccountKey) {
      return {};
    }
    const token = await googleIdToken(serviceAccountKey, new URL(endpoint).origin);
    return { Authorization: `Bearer ${token}` };
  };

  return {
    parseSave: async (data: BodyInit) =>
      fetchOkJson<ParseResult>(endpoint, {
        method: "POST",
        body: data,
        headers: {
          "Content-Type": "application/octet-stream",
          ...(await authHeaders()),
        },
      }),

    renderScreenshot: async (save: BodyInit) => {
      return fetchOk(`${endpoint}/screenshot`, {
        method: "POST",
        body: save,
        headers: {
          "Content-Type": "application/octet-stream",
          Accept: "image/webp",
          ...(await authHeaders()),
        },
      }).then((x) => x.arrayBuffer());
    },
  };
};
