import { fetchOk, fetchOkJson } from "@/lib/fetch";
import type { ParseResult } from "./save-parsing-types";
export type * from "./save-parsing-types";

export const pdxFns = ({ endpoint }: { endpoint: string }) => {
  return {
    parseSave: (data: BodyInit) =>
      fetchOkJson<ParseResult>(endpoint, {
        method: "POST",
        body: data,
        headers: {
          "Content-Type": "application/octet-stream",
        },
      }),

    convertScreenshot: (png: ArrayBuffer) => {
      return fetchOk(`${endpoint}/webp`, {
        method: "POST",
        body: png,
        headers: {
          "Content-Type": "application/octet-stream",
        },
      }).then((x) => x.arrayBuffer());
    },

    renderScreenshot: (save: BodyInit) => {
      return fetchOk(`${endpoint}/screenshot`, {
        method: "POST",
        body: save,
        headers: {
          "Content-Type": "application/octet-stream",
          Accept: "image/webp",
        },
      }).then((x) => x.arrayBuffer());
    },
  };
};
