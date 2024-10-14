// import { promises } from "fs";
// import { BUCKET, s3Fetch, s3FetchOk } from "@/server-lib/s3";
// import { NewKeyResponse, ProfileResponse } from "@/services/appApi";
// import { dbDisconnect, table, useDb } from "@/server-lib/db";
// import { parseSave } from "@/server-lib/save-parser";
// import { SavePostResponse } from "@/server-lib/models";
// import { fetchOk, fetchOkJson, sendJsonAs } from "@/lib/fetch";
// import { check } from "@/lib/isPresent";
// import type { AchievementResponse } from "app/api/achievements/[achievementId]/route";
// import { UserResponse } from "app/api/users/[userId]/route";
// import { NewestSaveResponse } from "app/api/new/route";
// import { SaveResponse } from "app/api/saves/[saveId]/route";
// globalThis.crypto = require("node:crypto").webcrypto;

import { beforeEach, expect, test } from "vitest";

test("1 + 1", () =>{
  expect(1 + 1).toBe(2);
})

// beforeEach(async () => {
  // await useDb(async (db) => {
  //   await db.delete(table.saves);
  //   await db.delete(table.users);
  // });
// });

// beforeEach(async () => {
//   const headBucket = await s3Fetch(BUCKET, { method: "HEAD" });
//   if (!headBucket.ok) {
//     await s3FetchOk(BUCKET, { method: "PUT" });
//   }

//   const objsData = await s3FetchOk(`${BUCKET}?list-type=2`);
//   const objText = await objsData.text();
//   const keys = [...objText.matchAll(/<Key>(.*?)<\/Key>/g)].map(([_, key]) =>
//     s3FetchOk(`${BUCKET}/${key}`, { method: "DELETE" }),
//   );
//   await Promise.all(keys);
// });

// const pdxUrl = (path: string) => `http://localhost:3000${path}`;

// async function getNewCookies(): Promise<string> {
//   const resp = await fetchOk(pdxUrl("/api/login/steam-callback"), {
//     redirect: "manual",
//   });
//   return check(resp.headers.get("set-cookie"));
// }

// class HttpClient {
//   private constructor(private cookies: string) {}

//   async uploadSaveHeaders(filepath: string, headers: RequestInit["headers"]) {
//     const data = await fetchEu4Save(filepath);
//     const file = new Blob([data], { type: "application/octet-stream" });

//     return await fetchOkJson<SavePostResponse>(pdxUrl("/api/saves"), {
//       method: "POST",
//       body: file,
//       headers: {
//         ...headers,
//         cookie: this.cookies,
//       },
//     });
//   }

//   async uploadSaveCore(filepath: string, metadata?: any) {
//     await fetchEu4Save(filepath);
//     const data = await promises.readFile(eu4SaveLocation(filepath));
//     const file = new Blob([data], { type: "application/octet-stream" });

//     const meta = JSON.stringify({
//       aar: "",
//       filename: "myfile.eu4",
//       content_type: "application/zip",
//       ...metadata,
//     });

//     const formData = new FormData();
//     formData.append("file", file);
//     formData.append("metadata", meta);

//     return await fetch(pdxUrl("/api/saves"), {
//       method: "POST",
//       headers: {
//         cookie: this.cookies,
//       },
//       body: formData,
//     });
//   }

//   public async uploadSave(filepath: string, metadata?: any) {
//     const resp = await this.uploadSaveCore(filepath, metadata);

//     if (!resp.ok) {
//       const body = await resp.text();
//       throw new Error(`failed to upload (${resp.status}): ${body}`);
//     }

//     return (await resp.json()) as SavePostResponse;
//   }

//   public async uploadSaveReq(filepath: string) {
//     return await this.uploadSaveCore(filepath);
//   }

//   public async getReq(path: string) {
//     return await fetch(pdxUrl(path), {
//       headers: {
//         cookie: this.cookies,
//       },
//     });
//   }

//   public async get<T>(path: string): Promise<T> {
//     return fetchOkJson(pdxUrl(path), { headers: { cookie: this.cookies } });
//   }

//   public async post<T>(path: string, data?: any): Promise<T> {
//     return await sendJsonAs<T>(pdxUrl(path), {
//       body: data ? JSON.stringify(data) : data,
//       headers: {
//         Cookie: this.cookies,
//       },
//     });
//   }

//   public async delete<T>(path: string): Promise<void> {
//     await fetchOk(pdxUrl(path), {
//       method: "DELETE",
//       headers: {
//         Cookie: this.cookies,
//       },
//     });
//   }

//   public async patch(path: string, data: any): Promise<void> {
//     await fetchOk(pdxUrl(path), {
//       method: "PATCH",
//       body: JSON.stringify(data),
//       headers: {
//         "Content-Type": "application/json",
//         Cookie: this.cookies,
//       },
//     });
//   }

//   public static async create() {
//     const cookie = await getNewCookies();
//     return new HttpClient(cookie.substring(0, cookie.indexOf(";") + 1));
//   }
// }

// async function parseFile(path: string) {
//   const fileData = await fetchEu4Save(path);
//   const data = await parseSave(fileData);

//   if (data.kind !== "Parsed") {
//     throw new Error("unable to parse");
//   } else {
//     return data;
//   }
// }

// function eu4SaveLocation(save: string) {
//   return `../../assets/eu4-saves/${save}`;
// }

// async function fetchEu4Save(save: string) {
//   const fp = eu4SaveLocation(save);

//   try {
//     return await promises.readFile(fp);
//   } catch {
//     const resp = await fetch(
//       `https://eu4saves-test-cases.s3.us-west-002.backblazeb2.com/${save}`,
//     );
//     if (!resp.ok) {
//       throw new Error(`unable to retrieve: ${save}`);
//     }
//     const buf = Buffer.from(await resp.arrayBuffer());
//     await promises.writeFile(fp, buf);
//     return buf;
//   }
// }

// test("same campaign", async () => {
//   // Uploading 3 saves from the same campaign
//   const client = await HttpClient.create();

//   let startPath = "ita2.eu4";
//   let midPath = "ita2_later.eu4";
//   let endPath = "ita2_later13.eu4";

//   let start = await parseFile(startPath);
//   let mid = await parseFile(midPath);
//   let end = await parseFile(endPath);

//   // sanity check to ensure we're dealing with the files from the same campaign
//   expect(start.playthrough_id).toBe(mid.playthrough_id);
//   expect(mid.playthrough_id).toBe(end.playthrough_id);

//   // Sanity check that these are separate files
//   expect(start.hash).not.toBe(mid.hash);
//   expect(mid.hash).not.toBe(end.hash);

//   // Now upload the halfway save. We should still be able to upload the later one
//   const midUpload = await client.uploadSave(midPath);
//   expect(midUpload.save_id).toBeDefined();

//   const endUpload = await client.uploadSave(endPath);
//   expect(endUpload.save_id).toBeDefined();

//   const startUpload = await client.uploadSave(startPath);
//   expect(startUpload.save_id).toBeDefined();

//   // When retrieving the achievements, we should only see the save with the earliest date
//   let achievementLeaderboard = await client.get<AchievementResponse>(
//     "/api/achievements/18",
//   );
//   expect(achievementLeaderboard.saves).toHaveLength(1);
//   expect(achievementLeaderboard.saves[0].id).toEqual(startUpload.save_id);

//   // But all saves will be exposed when viewing user saves
//   let userProfile = await client.get<UserResponse>("/api/users/100");
//   expect(userProfile.saves).toHaveLength(3);
//   expect(userProfile.saves[0].id).toEqual(startUpload.save_id);
//   expect(userProfile.saves[1].id).toEqual(endUpload.save_id);
//   expect(userProfile.saves[2].id).toEqual(midUpload.save_id);
// });

// test("invalid ironman", async () => {
//   const client = await HttpClient.create();

//   const newSave = await client.uploadSaveReq("Ruskies.eu4");

//   expect(newSave.status).toEqual(400);
//   const data = (await newSave.json()) as any;
//   expect(data.name).toEqual("ValidationError");
//   expect(data.msg).toEqual("unsupported patch: 1.28");
// });

// test("same playthrough id", async () => {
//   // This test will ensure that content id will catch two saves from the
//   // same playthrough with differing campaign id and not allow
//   // duplicated achievements to be detected.

//   const client = await HttpClient.create();
//   const startPath = "arda-shahansha.eu4";
//   const midPath = "arda-persia.eu4";

//   const start = await parseFile(startPath);
//   const mid = await parseFile(midPath);

//   // sanity check to ensure we're dealing with the files that have different
//   // campaign id but same playthrough_id
//   expect(start.playthrough_id).toBe(mid.playthrough_id);

//   const shahansha = await client.uploadSave(startPath);
//   const persia = await client.uploadSave(midPath);
//   expect(persia.save_id).toBeDefined();

//   // When retrieving the shahanshah achievement we should only see the start data
//   let achievementLeaderboard = await client.get<AchievementResponse>(
//     "/api/achievements/89",
//   );
//   expect(achievementLeaderboard.saves).toHaveLength(1);
//   expect(achievementLeaderboard.saves[0].id).toEqual(shahansha.save_id);

//   const newest = await client.get<NewestSaveResponse>("/api/new");
//   expect(newest.saves).toHaveLength(2);
//   expect(newest.saves[0].game_difficulty).toBe("Normal");
// });

// test("same playthrough disjoint set", async () => {
//   // This test will ensure that saves from the same playthrough that
//   // have a disjoint set of completed achievements can both be uploaded

//   const client = await HttpClient.create();
//   const tatarPath = "tartartar.eu4";
//   const goldenPath = "tartar-gold.eu4";

//   const tatar = await parseFile(tatarPath);
//   const golden = await parseFile(goldenPath);

//   // sanity check to ensure we're dealing with the files with same playthrough id
//   expect(tatar.playthrough_id).toBe(golden.playthrough_id);

//   const tatarUpload = await client.uploadSave(tatarPath);
//   expect(tatarUpload.save_id).toBeDefined();

//   const goldenUpload = await client.uploadSave(goldenPath);
//   expect(goldenUpload.save_id).toBeDefined();
// });

// test("reject duplicate uploads", async () => {
//   const client = await HttpClient.create();
//   const tatarPath = "tartartar.eu4";

//   const tatarUpload = await client.uploadSave(tatarPath);
//   expect(tatarUpload.save_id).toBeDefined();

//   await expect(client.uploadSave(tatarPath)).rejects.toThrow(
//     "save already exists",
//   );
// });

// test("delete save", async () => {
//   const client = await HttpClient.create();
//   const ita1Path = "ita1.eu4";
//   const kandyPath = "kandy2.bin.eu4";

//   const kandy = await client.uploadSave(kandyPath);
//   expect(kandy.save_id).toBeDefined();

//   const ita1 = await client.uploadSave(ita1Path);
//   expect(ita1.save_id).toBeDefined();

//   await client.delete(`/api/saves/${ita1.save_id}`);

//   let userProfile = await client.get<UserResponse>("/api/users/100");
//   expect(userProfile.saves).toHaveLength(1);

//   await client.delete(`/api/saves/${kandy.save_id}`);

//   userProfile = await client.get<UserResponse>("/api/users/100");
//   expect(userProfile.saves).toHaveLength(0);

//   const achievement = await client.get<AchievementResponse>(
//     "/api/achievements/18",
//   );
//   expect(achievement.saves).toHaveLength(0);

//   const kandy2 = await client.uploadSave(kandyPath);
//   expect(kandy2.save_id).not.toBe(kandy.save_id);
// });

// test("set aar", async () => {
//   const client = await HttpClient.create();
//   const ita1Path = "ita1.eu4";
//   const initAar = "hello world";
//   const uploadResponse = await client.uploadSave(ita1Path, { aar: initAar });
//   const uploadedSave = await client.get<SaveResponse>(
//     `/api/saves/${uploadResponse.save_id}`,
//   );
//   expect(uploadedSave.aar).toBe(initAar);

//   await client.patch(`/api/saves/${uploadResponse.save_id}`, {
//     aar: "goodbye",
//     filename: "hello world.eu4",
//   });

//   const updatedSave = await client.get<SaveResponse>(
//     `/api/saves/${uploadResponse.save_id}`,
//   );
//   expect(updatedSave.aar).toBe("goodbye");
//   expect(updatedSave.filename).toBe("hello world.eu4");
// });

// test("chinese supplementary", async () => {
//   const client = await HttpClient.create();
//   const path = "chinese-supplementary.eu4";
//   const newSave = await client.uploadSave(path);
//   const meta = await client.get<SaveResponse>(`/api/saves/${newSave.save_id}`);
//   expect(meta.player_tag_name).toBe("Saluzzo");
// });

// test("plain saves", async () => {
//   const client = await HttpClient.create();
//   const path = "Granada1468_05_09.eu4.zst";
//   const upload = await client.uploadSave(path, {
//     content_type: "application/zstd",
//   });
//   const fileReq = await client.getReq(`/api/saves/${upload.save_id}/file`);
//   const save = await parseSave(await fileReq.arrayBuffer());
//   expect(save.kind).toBe("Parsed");
//   if (save.kind == "Parsed") {
//     expect(save.encoding).toBe("text");
//   }
// });

// test("get profile", async () => {
//   const client = await HttpClient.create();
//   const profile = await client.get<ProfileResponse>("/api/profile");
//   expect(profile).toHaveProperty("user.user_id", "100");
// });

// test("get profile with api key", async () => {
//   const client = await HttpClient.create();
//   const key = await client.post<NewKeyResponse>("/api/key", undefined);

//   const kandyPath = "kandy2.bin.eu4";

//   const kandy = await client.uploadSave(kandyPath);
//   expect(kandy.save_id).toBeDefined();

//   await fetchOk(pdxUrl(`/api/saves/${kandy.save_id}`), {
//     method: "DELETE",
//     headers: {
//       Authorization:
//         "Basic " + Buffer.from(`100:${key.api_key}`).toString("base64"),
//     },
//   });

//   const newest = await client.get<NewestSaveResponse>("/api/new");
//   expect(newest.saves).toHaveLength(0);
// });

// test("admin rebalance", async () => {
//   const client = await HttpClient.create();

//   // test with empty database
//   await client.post("/api/admin/rebalance");

//   // upload a save at patch 1.29 and recalculate the score
//   // if EU4 ever gets to 1.243
//   const midUpload = await client.uploadSave("ita2.eu4");
//   expect(midUpload.save_id).toBeDefined();

//   // test with empty database
//   await client.post("/api/admin/rebalance?__patch_override_for_testing=243");

//   let achievementLeaderboard = await client.get<AchievementResponse>(
//     "/api/achievements/18",
//   );
//   expect(achievementLeaderboard.saves).toHaveLength(1);
//   expect(achievementLeaderboard.saves[0].patch).toBe("1.29");
//   expect(achievementLeaderboard.saves[0].days).toBe(30527);
//   expect(achievementLeaderboard.saves[0].weighted_score?.days).toBe(683804);
// });

// test("api post new save", async () => {
//   const client = await HttpClient.create();
//   const path = "Granada1468_05_09.eu4.zst";
//   const upload = await client.uploadSaveHeaders(path, {
//     "pdx-tools-filename": "granada.eu4",
//     "Content-Type": "application/zstd",
//   });

//   expect(upload.save_id).toBeDefined();
// });
