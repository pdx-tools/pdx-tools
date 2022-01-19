import FormData from "form-data";
import { createReadStream, existsSync, writeFileSync } from "fs";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
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

async function getNewCookies() {
  const resp = await axios.post("http://localhost:3000/api/login/steam", null, {
    maxRedirects: 0,
    validateStatus: (s) => s < 400,
  });

  return resp.headers["set-cookie"];
}

class HttpClient {
  private constructor(private cookies: string) {}

  async uploadSaveCore<T>(
    filepath: string,
    metadata?: any,
    validateStatus?: AxiosRequestConfig["validateStatus"]
  ) {
    await fetchEu4Save(filepath);
    const data = createReadStream(eu4SaveLocation(filepath));

    const meta = JSON.stringify({
      aar: "",
      filename: "myfile.eu4",
      content_type: "application/zip",
      ...metadata,
    });

    const formData = new FormData();
    formData.append("file", data);
    formData.append("metadata", meta);

    return await axios.post<T>("http://localhost:3000/api/saves", formData, {
      headers: {
        ...formData.getHeaders(),
        cookie: this.cookies,
      },
      withCredentials: true,
      validateStatus,
    });
  }

  public async uploadSave(filepath: string, metadata?: any) {
    return await this.uploadSaveCore<SavePostResponse>(filepath, metadata);
  }

  public async uploadSaveAllowError(filepath: string) {
    return await this.uploadSaveCore<any>(filepath, {}, () => true);
  }

  public async get<T>(path: string): Promise<AxiosResponse<T>> {
    return await axios.get<T>(`http://localhost:3000${path}`, {
      headers: {
        cookie: this.cookies,
      },
      withCredentials: true,
    });
  }

  public async post<T>(path: string, data: any): Promise<AxiosResponse<T>> {
    return await axios.post<T>(`http://localhost:3000${path}`, data, {
      headers: {
        cookie: this.cookies,
      },
      withCredentials: true,
    });
  }

  public async delete<T>(path: string): Promise<AxiosResponse<T>> {
    return await axios.delete<T>(`http://localhost:3000${path}`, {
      headers: {
        cookie: this.cookies,
      },
      withCredentials: true,
    });
  }

  public async patch<T>(path: string, data: any): Promise<AxiosResponse<T>> {
    return await axios.patch<T>(`http://localhost:3000${path}`, data, {
      headers: {
        cookie: this.cookies,
      },
      withCredentials: true,
    });
  }

  public req() {
    return axios;
  }

  public static async create() {
    const cookies = await getNewCookies();
    if (cookies === undefined) {
      throw new Error("unable to retrieve cookies");
    }
    return new HttpClient(cookies[0]);
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
    const resp = await axios.get(
      `https://eu4saves-test-cases.s3.us-west-002.backblazeb2.com/${save}`,
      { responseType: "arraybuffer" }
    );
    writeFileSync(fp, resp.data);
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
    expect(resp.data.qualifying_record).toBe(true);
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
    expect(resp.data.qualifying_record).toBe(true);
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
    expect(resp.data.qualifying_record).toBe(true);
  }

  // Now upload the halfway save. It'll cause the later save to not be a qualifying record
  const midUpload = await client.uploadSave(midPath);
  expect(midUpload.data.save_id).toBeDefined();

  {
    const resp = await client.post<CheckResponse>("/api/check", endCheckReq);
    expect(resp.data.qualifying_record).toBe(false);
  }

  // Ensure that upload matches check behavior
  const endUpload = await client.uploadSave(endPath);
  expect(endUpload.data.used_save_slot).toBe(true);
  expect(endUpload.data.save_id).toBeDefined();

  // But we can still upload the earliest save
  const startUpload = await client.uploadSave(startPath);
  expect(startUpload.data.save_id).toBeDefined();
  expect(startUpload.data.used_save_slot).toBe(false);

  // When retrieving the achievements, we should only see the save with the earliest date
  let achievementLeaderboard = await client.get<AchievementView>(
    "/api/achievements/18"
  );
  expect(achievementLeaderboard.data.saves).toHaveLength(1);
  expect(achievementLeaderboard.data.saves[0].id).toEqual(
    startUpload.data.save_id
  );

  // But both saves will be exposed when viewing user saves
  let userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.data.saves).toHaveLength(3);
  expect(userProfile.data.saves[0].id).toEqual(startUpload.data.save_id);
  expect(userProfile.data.saves[1].id).toEqual(endUpload.data.save_id);
  expect(userProfile.data.saves[2].id).toEqual(midUpload.data.save_id);
});

test("invalid ironman", async () => {
  const client = await HttpClient.create();

  const newSave = await client.uploadSaveAllowError("Ruskies.eu4");

  expect(newSave.status).toEqual(400);
  expect(newSave.data.name).toEqual("ValidationError");
  expect(newSave.data.msg).toEqual("unsupported patch: 1.28");
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
  expect(persia.data.save_id).toBeDefined();

  // When retrieving the shahanshah achievement we should only see the start data
  let achievementLeaderboard = await client.get<AchievementView>(
    "/api/achievements/89"
  );
  expect(achievementLeaderboard.data.saves).toHaveLength(1);
  expect(achievementLeaderboard.data.saves[0].id).toEqual(
    shahansha.data.save_id
  );

  const newest = await client.get<{ saves: SaveFile[] }>("/api/new");
  expect(newest.data.saves).toHaveLength(2);
  expect(newest.data.saves[0].game_difficulty).toBe("Normal");
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
  expect(tatarUpload.data.save_id).toBeDefined();

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
    expect(resp.data.qualifying_record).toBe(true);
  }

  const goldenUpload = await client.uploadSave(goldenPath);
  expect(goldenUpload.data.save_id).toBeDefined();
});

test("delete save", async () => {
  const client = await HttpClient.create();
  const ita1Path = "ita1.eu4";
  const kandyPath = "kandy2.bin.eu4";

  const kandy = await client.uploadSave(kandyPath);
  expect(kandy.data.save_id).toBeDefined();

  const ita1 = await client.uploadSave(ita1Path);
  expect(ita1.data.save_id).toBeDefined();

  await client.delete(`/api/saves/${ita1.data.save_id}`);

  let userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.data.saves).toHaveLength(1);

  await client.delete(`/api/saves/${kandy.data.save_id}`);

  userProfile = await client.get<UserSaves>("/api/users/100");
  expect(userProfile.data.saves).toHaveLength(0);

  const achievements = await client.get<ApiAchievementsResponse>(
    "/api/achievements"
  );
  const achievement = achievements.data.achievements.find(
    (x) => x.name === "Italian Ambition"
  );
  expect(achievement?.uploads).toBe(0);

  const kandy2 = await client.uploadSave(kandyPath);
  expect(kandy2.data.save_id).not.toBe(kandy.data.save_id);
});

test("set aar", async () => {
  const client = await HttpClient.create();
  const ita1Path = "ita1.eu4";
  const initAar = "hello world";
  const uploadResponse = await client.uploadSave(ita1Path, { aar: initAar });
  const uploadedSave = await client.get<SaveFile>(
    `/api/saves/${uploadResponse.data.save_id}`
  );
  expect(uploadedSave.data.aar).toBe(initAar);

  await client.patch(`/api/saves/${uploadResponse.data.save_id}`, {
    aar: "goodbye",
    filename: "hello world.eu4",
  });

  const updatedSave = await client.get<SaveFile>(
    `/api/saves/${uploadResponse.data.save_id}`
  );
  expect(updatedSave.data.aar).toBe("goodbye");
  expect(updatedSave.data.filename).toBe("hello world.eu4");
});

test("chinese supplementary", async () => {
  const client = await HttpClient.create();
  const path = "chinese-supplementary.eu4";
  const newSave = await client.uploadSave(path);
  const meta = await client.get<SaveFile>(`/api/saves/${newSave.data.save_id}`);
  expect(meta.data.displayed_country_name).toBe("Saluzzo");
});

test("plain saves", async () => {
  const client = await HttpClient.create();
  const path = "Granada1468_05_09.eu4.gz";
  const upload = await client.uploadSave(path, {
    content_type: "plain/text",
    content_encoding: "gzip",
  });
  const data = await client.get<string>(
    `/api/saves/${upload.data.save_id}/file`
  );
  expect(data.data.slice(0, 6)).toBe("EU4txt");
});

test("get profile", async () => {
  const client = await HttpClient.create();
  const profile = await client.get<ProfileResponse>("/api/profile");
  expect(profile.data).toHaveProperty("user.user_id", "100");
});

test("get profile with api key", async () => {
  const client = await HttpClient.create();
  const key = await client.post<NewKeyResponse>("/api/key", undefined);

  const kandyPath = "kandy2.bin.eu4";

  const kandy = await client.uploadSave(kandyPath);
  expect(kandy.data.save_id).toBeDefined();

  await client
    .req()
    .delete(`http://localhost:3000/api/saves/${kandy.data.save_id}`, {
      auth: {
        username: "100",
        password: key.data.api_key,
      },
    });

  const newest = await client.get<{ saves: SaveFile[] }>("/api/new");
  expect(newest.data.saves).toHaveLength(0);
});

test("admin rebalance", async () => {
  const client = await HttpClient.create();

  // test with empty redis instamce
  const resp1 = await client.post("/api/admin/rebalance", undefined);
  expect(resp1.status).toBe(200);

  const redis = await redisClient();
  await redis.zAdd("raw_achievement_scores:108:1.29", [
    { value: "MY_SAVE_ID", score: 100 },
  ]);
  await redis.zAdd("achievement_scores:108", [
    { value: "MY_SAVE_ID", score: 100 },
  ]);

  const resp2 = await client.post("/api/admin/rebalance", undefined);
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
