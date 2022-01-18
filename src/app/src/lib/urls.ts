import { dataUrls, defaultVersion } from "./data_gen";

export function getDataUrls(version: string) {
  return dataUrls[version] ?? dataUrls[defaultVersion];
}
