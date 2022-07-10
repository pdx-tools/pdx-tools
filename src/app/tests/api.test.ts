import { createReadStream, existsSync, writeFileSync, promises } from "fs";
import { fetch, FormData } from "undici";
import { db } from "../src/server-lib/db";
import { BUCKET, deleteFile, s3client } from "../src/server-lib/s3";
import * as pool from "../src/server-lib/pool";
import { redisClient } from "../src/server-lib/redis";
import { SavePostResponse } from "../src/pages/api/saves";
import {
  AchievementView,
  ApiAchievementsResponse,
  CheckRequest,
  CheckResponse,
  NewKeyResponse,
  ProfileResponse,
  SaveFile,
  UserSaves,
} from "@/services/appApi";
import { Blob } from "buffer";

jest.setTimeout(60000);

beforeEach(async () => {
  const deleteSaves = db.save.deleteMany();
  const deleteUsers = db.user.deleteMany();

  await db.$transaction([deleteSaves, deleteUsers]);
});

beforeEach(async () => {
  const buckets = await s3client.listBuckets().promise();
  const hasBucket = (buckets.Buckets || []).find((x) => x.Name === BUCKET);
  if (!hasBucket) {
    await s3client.createBucket({ Bucket: BUCKET }).promise();
  } else {
    const objs = await s3client.listObjectsV2({ Bucket: BUCKET }).promise();
    const deletes = (objs.Contents || []).map((x) => {
      deleteFile(x.Key!);
    });

    await Promise.all(deletes);
  }
});

beforeEach(async () => {
  const client = await redisClient();
  await client.flushDb();
});

afterAll(async () => {
  await db.$disconnect();
});

afterAll(async () => {
  const client = await redisClient();
  await client.disconnect();
});

const pdxUrl = (path: string) => `http://localhost:3000${path}`;

async function getNewCookies(): Promise<string> {
  const resp = await fetch(pdxUrl("/api/login/steam"), {
    method: "POST",
    redirect: "manual",
  });
  const result = resp.headers.get("set-cookie");
  if (result === null) {
    throw new Error("did not get cookie");
  }
  return result;
}

class HttpClient {
  private constructor(private cookies: string) {}

  async uploadSaveHeaders(filepath: string, headers: RequestInit["headers"]) {
    await fetchEu4Save(filepath);
    const data = await promises.readFile(eu4SaveLocation(filepath));
    const file = new Blob([data], { type: "application/octet-stream" });

    const resp = await fetch(pdxUrl("/api/saves"), {
      method: "POST",
      body: file,
      headers: {
        ...headers,
        cookie: this.cookies,
      },
    });

    if (!resp.ok) {
      throw new Error("unable to upload save");
    }

    return (await resp.json()) as SavePostResponse;
  }

  async uploadSaveCore(filepath: string, metadata?: any) {
    await fetchEu4Save(filepath);
    const data = await promises.readFile(eu4SaveLocation(filepath));
    const file = new Blob([data], { type: "application/octet-stream" });

    const meta = JSON.stringify({
      aar: "",
      filename: "myfile.eu4",
      content_type: "application/zip",
      ...metadata,
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("metadata", meta);

    return await fetch(pdxUrl("/api/saves"), {
      method: "POST",
      headers: {
        cookie: this.cookies,
      },
      body: formData,
    });
  }

  public async uploadSave(filepath: string, metadata?: any) {
    const resp = await this.uploadSaveCore(filepath, metadata);

    if (!resp.ok) {
      throw new Error("unable to upload save");
    }

    return (await resp.json()) as SavePostResponse;
  }

  public async uploadSaveReq(filepath: string) {
    return await this.uploadSaveCore(filepath);
  }

  public async getReq(path: string) {
    return await fetch(pdxUrl(path), {
      headers: {
        cookie: this.cookies,
      },
    });
  }

  public async get<T>(path: string): Promise<T> {
    const resp = await this.getReq(path);

    if (!resp.ok) {
      throw new Error(`unable to get ${path}`);
    }

    return (await resp.json()) as T;
  }

  public async postReq(path: string, data?: any) {
    return await fetch(pdxUrl(path), {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookies,
      },
    });
  }

  public async post<T>(path: string, data: any): Promise<T> {
    const resp = await fetch(pdxUrl(path), {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookies,
      },
    });

    if (!resp.ok) {
      throw new Error("unable to post");
    }

    return (await resp.json()) as T;
  }

  public async delete<T>(path: string): Promise<void> {
    const resp = await fetch(pdxUrl(path), {
      method: "DELETE",
      headers: {
        Cookie: this.cookies,
      },
    });

    await resp.text();
    if (!resp.ok) {
      throw new Error("unable to delete");
    }
  }

  public async patch<T>(path: string, data: any): Promise<void> {
    const resp = await fetch(pdxUrl(path), {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookies,
      },
    });

    await resp.text();
    if (!resp.ok) {
      throw new Error("unable to patch");
    }
  }

  public static async create() {
    const cookie = await getNewCookies();
    return new HttpClient(cookie);
  }
}

async function parseFile(path: string): Promise<pool.ParsedFile> {
  await fetchEu4Save(path);
  const data = await pool.parseFile(eu4SaveLocation(path));

  if (data.kind !== "Parsed") {
    throw new Error("unable to parse");
  } else {
    return data;
  }
}

function eu4SaveLocation(save: string) {
  return `../../assets/eu4-saves/${save}`;
}

async function fetchEu4Save(save: string) {
  const fp = eu4SaveLocation(save);

  if (!existsSync(fp)) {
    const resp = await fetch(
      `https://eu4saves-test-cases.s3.us-west-002.backblazeb2.com/${save}`
    );
    if (!resp.ok) {
      throw new Error(`unable to retrieve: ${save}`);
    }
    let buf = await resp.arrayBuffer();
    writeFileSync(fp, Buffer.from(buf));
  }
}

test("same campaign", async () => {
  // This test will ensure that given three saves of the same campaign that checking them all
  // initially will allow an upload. Then uploading the middle save will only allow the
  // earliest save to be uploaded.
  const client = await HttpClient.create();

  let startPath = "ita2.eu4";
  let midPath = "ita2_later.eu4";
  let endPath = "ita2_later13.eu4";

  let start = await parseFile(startPath);
  let mid = await parseFile(midPath);
  let end = await parseFile(endPath);

  // sanity check to ensure we're dealing with the files from the same campaign
  expect(start.campaign_id).toBe(mid.campaign_id);
  expect(mid.campaign_id).toBe(end.campaign_id);

  // Sanity check that these are separate files
  const startHash = await pool.fileChecksum(eu4SaveLocation(startPath));
  const midHash = await pool.fileChecksum(eu4SaveLocation(midPath));
  const endHash = await pool.fileChecksum(eu4SaveLocation(endPath));
  expect(startHash).not.toBe(midHash);
  expect(midHash).not.toBe(endHash);

  const startCheckReq: CheckRequest = {
    hash: startHash,
    playthrough_id: start.playthrough_id,
    achievement_ids: start.achievements || [],
    campaign_id: start.campaign_id,
    patch: start.patch,
    score: start.days,
  };

  {
    const resp = await client.post<CheckResponse>("/api/check", startCheckReq);
    expect(resp.qualifying_record).toBe(true);
  }

  const midCheckReq: CheckRequest = {
    hash: midHash,
    playthrough_id: mid.playthrough_id,
    achievement_ids: mid.achievements || [],
    campaign_id: mid.campaign_id,
    patch: mid.patch,
    score: mid.days,
  };

  {
    const resp = await client.post<CheckResponse>("/api/check", midCheckReq);
    expect(resp.qualifying_record).toBe(true);
  }

  const endCheckReq: CheckRequest = {
    hash: endHash,
    playthrough_id: end.playthrough_id,
    achievement_ids: end.achievements || [],
    campaign_id: end.campaign_id,
    patch: end.patch,
    score: end.days,
  };

  {
    const resp = await client.post<CheckResponse>("/api/check", endCheckReq);
    expect(resp.qualifying_record).toBe(true);
  }

  // Now upload the halfway save. It'll cause the later save to not be a qualifying record
  const midUpload = await client.uploadSave(midPath);
  expect(midUpload.save_id).toBeDefined();

  {
    const resp = await client.post<CheckResponse>("/api/check", endCheckReq);
    expect(resp.qualifying_record).toBe(false);
  }

  // Ensure that upload matches check behavior
  const endUpload = await client.uploadSave(endPath);
  expect(endUpload.used_save_slot).toBe(true);
  expect(endUpload.save_id).toBeDefined();

  // But we can still upload the earliest save
  const startUpload = await client.uploadSave(startPath);
  expect(startUpload.save_id).toBeDefined();
  expect(startUpload.used_save_slot).toBe(false);

  // When retrieving the achievements, we should only see the save with the earliest date
  let achievementLeaderboard = await client.get<AchievementView>(
    "/api/achievements/18"
  );
  expect(achievementLeaderboard.saves).toHaveLength(1);
  expect(achievementLeaderboard.saves[0].id).toEqual(startUpload.save_id);

  // But both saves will be exposed when viewing user saves
  let userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.saves).toHaveLength(3);
  expect(userProfile.saves[0].id).toEqual(startUpload.save_id);
  expect(userProfile.saves[1].id).toEqual(endUpload.save_id);
  expect(userProfile.saves[2].id).toEqual(midUpload.save_id);
});

test("invalid ironman", async () => {
  const client = await HttpClient.create();

  const newSave = await client.uploadSaveReq("Ruskies.eu4");

  expect(newSave.status).toEqual(400);
  const data = (await newSave.json()) as any;
  expect(data.name).toEqual("ValidationError");
  expect(data.msg).toEqual("unsupported patch: 1.28");
});

test("same playthrough id", async () => {
  // This test will ensure that content id will catch two saves from the
  // same playthought with differing campaign id and not allow
  // duplicated achievements to be detected.

  const client = await HttpClient.create();
  const startPath = "arda-shahansha.eu4";
  const midPath = "arda-persia.eu4";

  const start = await parseFile(startPath);
  const mid = await parseFile(midPath);

  // sanity check to ensure we're dealing with the files that have different
  // campaign id but same playthrough_id
  expect(start.campaign_id).not.toBe(mid.campaign_id);
  expect(start.playthrough_id).toBe(mid.playthrough_id);

  const shahansha = await client.uploadSave(startPath);
  const persia = await client.uploadSave(midPath);
  expect(persia.save_id).toBeDefined();

  // When retrieving the shahanshah achievement we should only see the start data
  let achievementLeaderboard = await client.get<AchievementView>(
    "/api/achievements/89"
  );
  expect(achievementLeaderboard.saves).toHaveLength(1);
  expect(achievementLeaderboard.saves[0].id).toEqual(shahansha.save_id);

  const newest = await client.get<{ saves: SaveFile[] }>("/api/new");
  expect(newest.saves).toHaveLength(2);
  expect(newest.saves[0].game_difficulty).toBe("Normal");
});

test("same playthrough disjoint set", async () => {
  // This test will ensure that saves from the same playthrough that
  // have a disjoint set of completed achievements can both be uploaded

  const client = await HttpClient.create();
  const tatarPath = "tartartar.eu4";
  const goldenPath = "tartar-gold.eu4";

  const tatar = await parseFile(tatarPath);
  const golden = await parseFile(goldenPath);
  const goldenHash = await pool.fileChecksum(eu4SaveLocation(goldenPath));

  // sanity check to ensure we're dealing with the files with same playthrough id
  expect(tatar.playthrough_id).toBe(golden.playthrough_id);

  const tatarUpload = await client.uploadSave(tatarPath);
  expect(tatarUpload.save_id).toBeDefined();

  const endCheckReq: CheckRequest = {
    hash: goldenHash,
    playthrough_id: golden.playthrough_id,
    achievement_ids: golden.achievements || [],
    campaign_id: golden.campaign_id,
    patch: golden.patch,
    score: golden.days,
  };

  {
    const resp = await client.post<CheckResponse>("/api/check", endCheckReq);
    expect(resp.qualifying_record).toBe(true);
  }

  const goldenUpload = await client.uploadSave(goldenPath);
  expect(goldenUpload.save_id).toBeDefined();
});

test("delete save", async () => {
  const client = await HttpClient.create();
  const ita1Path = "ita1.eu4";
  const kandyPath = "kandy2.bin.eu4";

  const kandy = await client.uploadSave(kandyPath);
  expect(kandy.save_id).toBeDefined();

  const ita1 = await client.uploadSave(ita1Path);
  expect(ita1.save_id).toBeDefined();

  await client.delete(`/api/saves/${ita1.save_id}`);

  let userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.saves).toHaveLength(1);

  await client.delete(`/api/saves/${kandy.save_id}`);

  userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.saves).toHaveLength(0);

  const achievements = await client.get<ApiAchievementsResponse>(
    "/api/achievements"
  );
  const achievement = achievements.achievements.find(
    (x) => x.name === "Italian Ambition"
  );
  expect(achievement?.uploads).toBe(0);

  const kandy2 = await client.uploadSave(kandyPath);
  expect(kandy2.save_id).not.toBe(kandy.save_id);
});

test("set aar", async () => {
  const client = await HttpClient.create();
  const ita1Path = "ita1.eu4";
  const initAar = "hello world";
  const uploadResponse = await client.uploadSave(ita1Path, { aar: initAar });
  const uploadedSave = await client.get<SaveFile>(
    `/api/saves/${uploadResponse.save_id}`
  );
  expect(uploadedSave.aar).toBe(initAar);

  await client.patch(`/api/saves/${uploadResponse.save_id}`, {
    aar: "goodbye",
    filename: "hello world.eu4",
  });

  const updatedSave = await client.get<SaveFile>(
    `/api/saves/${uploadResponse.save_id}`
  );
  expect(updatedSave.aar).toBe("goodbye");
  expect(updatedSave.filename).toBe("hello world.eu4");
});

test("chinese supplementary", async () => {
  const client = await HttpClient.create();
  const path = "chinese-supplementary.eu4";
  const newSave = await client.uploadSave(path);
  const meta = await client.get<SaveFile>(`/api/saves/${newSave.save_id}`);
  expect(meta.displayed_country_name).toBe("Saluzzo");
});

test("plain saves", async () => {
  const client = await HttpClient.create();
  const path = "Granada1468_05_09.eu4.gz";
  const upload = await client.uploadSave(path, {
    content_type: "plain/text",
    content_encoding: "gzip",
  });
  const data = await client.getReq(`/api/saves/${upload.save_id}/file`);
  const resp = await data.text();
  expect(resp.slice(0, 6)).toBe("EU4txt");
});

test("get profile", async () => {
  const client = await HttpClient.create();
  const profile = await client.get<ProfileResponse>("/api/profile");
  expect(profile).toHaveProperty("user.user_id", "100");
});

test("get profile with api key", async () => {
  const client = await HttpClient.create();
  const key = await client.post<NewKeyResponse>("/api/key", undefined);

  const kandyPath = "kandy2.bin.eu4";

  const kandy = await client.uploadSave(kandyPath);
  expect(kandy.save_id).toBeDefined();

  const req = await fetch(pdxUrl(`/api/saves/${kandy.save_id}`), {
    method: "DELETE",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`100:${key.api_key}`).toString("base64"),
    },
  });

  expect(req.ok).toEqual(true);
  const newest = await client.get<{ saves: SaveFile[] }>("/api/new");
  expect(newest.saves).toHaveLength(0);
});

test("admin rebalance", async () => {
  const client = await HttpClient.create();

  // test with empty redis instamce
  const resp1 = await client.postReq("/api/admin/rebalance");
  expect(resp1.status).toBe(200);

  const redis = await redisClient();
  await redis.zAdd("raw_achievement_scores:108:1.29", [
    { value: "MY_SAVE_ID", score: 100 },
  ]);
  await redis.zAdd("achievement_scores:108", [
    { value: "MY_SAVE_ID", score: 100 },
  ]);

  const resp2 = await client.postReq("/api/admin/rebalance");
  expect(resp2.status).toBe(200);

  let newScore = 100.0 * pool.weightedFactor(1, 29)!;
  const out = await redis.zRangeWithScores(
    "raw_achievement_scores:108:1.29",
    0,
    -1
  );
  expect(out).toHaveLength(1);
  expect(out[0]).toStrictEqual({ score: 100, value: "MY_SAVE_ID" });

  const out2 = await redis.zRangeWithScores("achievement_scores:108", 0, -1);
  expect(out2).toHaveLength(1);
  expect(out2[0]).toStrictEqual({ score: newScore, value: "MY_SAVE_ID" });
});

test("api post new save", async () => {
  const client = await HttpClient.create();
  const path = "Granada1468_05_09.eu4.gz";
  const upload = await client.uploadSaveHeaders(path, {
    "rakaly-filename": "granada.eu4",
    "Content-Type": "text/plain; charset=windows-1252",
    "Content-Encoding": "gzip",
  });

  expect(upload.save_id).toBeDefined();
});
