import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { ParseResult } from "./save-parsing-types";
export type * from "./save-parsing-types";

export const parseSave = (data: BodyInit) =>
  fetchOkJson<ParseResult>(check(import.meta.env["VITE_PARSE_API_ENDPOINT"]), {
    method: "POST",
    body: data,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });


export const convertScreenshot = async (png: ArrayBuffer) => {
    const endpoint = check(process.env["PARSE_API_ENDPOINT"]);
    return fetchOk(`${endpoint}/webp`, {
      method: "POST",
      body: png,
      headers: {
        "Content-Type": "application/octet-stream",
      },
    }).then((x) => x.arrayBuffer());
  };
  