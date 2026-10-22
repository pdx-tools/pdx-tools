import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { ResidentStore } from "@/features/campaign/analysis/residentStore";
import { sessionApi } from "@/features/campaign/analysis/session";
import { eu5PayloadAdapter, mapFrame } from "./analysisStore";

const store = new ResidentStore(eu5PayloadAdapter);
export const analysisApi = {
  ...sessionApi(store),
  ...frameServer((id) => mapFrame(store, id)),
};
expose(analysisApi);
