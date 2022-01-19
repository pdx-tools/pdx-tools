import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type SaveEncoding = "text" | "textzip" | "binzip";

export interface WeightedScore {
  days: number;
  date: string;
}

export interface GameVersion {
  first: number;
  second: number;
  third: number;
  fourth: number;
}

export interface SaveFile {
  id: string;
  filename: string;
  upload_time: string;
  user_name: string;
  user_id: string;
  date: string;
  days: number;
  player: string;
  displayed_country_name: string;
  player_start_tag: string | null;
  player_start_tag_name: string | null;
  campaign_id: string;
  ironman: boolean;
  multiplayer: boolean;
  patch: string;
  dlc: number[];
  achievements: number[];
  weighted_score: WeightedScore | null;
  game_difficulty: GameDifficulty;
  aar: string | undefined | null;
  version: GameVersion;
  encoding: SaveEncoding;
}

export type GameDifficulty =
  | "VeryEasy"
  | "Easy"
  | "Normal"
  | "Hard"
  | "VeryHard";

export interface UserSaves {
  saves: SaveFile[];
  user_info: PublicUserInfo | null;
}

export interface PublicUserInfo {
  user_id: string;
  user_name: string | null;
  created_on: string;
}

export interface PrivateUserInfo {
  user_id: string;
  steam_id: string;
  user_name: string | null;
  account: "free" | "admin";
  created_on: string;
}

export type ProfileResponse =
  | {
      kind: "guest";
    }
  | {
      kind: "user";
      user: PrivateUserInfo;
    };

export interface ApiAchievementsResponse {
  achievements: AchievementWithTopSave[];
  saves: SaveFile[];
}

export type AchievementWithTopSave = Achievement & {
  top_save_id: string | null;
  uploads: number;
};

export type AchievementDifficulty =
  | "VeryEasy"
  | "Easy"
  | "Medium"
  | "Hard"
  | "VeryHard"
  | "Insane";

export interface Achievement {
  id: number;
  name: string;
  description: string;
  difficulty: AchievementDifficulty;
}

export interface AchievementView {
  achievement: AchievementWithTopSave;
  saves: SaveFile[];
}

export interface NewKeyResponse {
  api_key: string;
}

export type RankedSaveFile = { rank: number } & SaveFile;

export interface SavePatchProps {
  id: string;
  aar?: string;
  filename?: string;
}

export interface SkanUserSaves {
  hash: string;
  timestamp: string;
  name: string;
  uploaded_by: string;
  player: string;
  multiplayer: string;
  date: string;
  customname: string | null;
  last_visited: string;
  view_count: string;
  version: string;
}

export interface CheckRequest {
  hash: string;
  patch: GameVersion;
  campaign_id: string;
  score: number;
  achievement_ids: number[];
  playthrough_id: string | null;
}

export interface CheckResponse {
  saves: SaveFile[];
  qualifying_record: boolean;
  valid_patch: boolean;
  remaining_save_slots: number;
}

export async function checkSave(req: CheckRequest): Promise<CheckResponse> {
  const body = JSON.stringify(req);
  const request = await fetch("/api/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  const response = await request.json();
  if (!request.ok) {
    throw Error(response.msg);
  }
  return response as CheckResponse;
}

export async function getSaveMeta(saveId: string): Promise<SaveFile> {
  const request = await fetch(`/api/saves/${saveId}`);
  const response = await request.json();
  return response as SaveFile;
}

async function streamResponse(
  response: Response,
  progress: (percent: number) => void
): Promise<Uint8Array> {
  let contentHeader = response.headers.get("Content-Length");
  if (contentHeader === null || isNaN(+contentHeader)) {
    const data = await response.arrayBuffer();
    return new Uint8Array(data);
  }

  let contentLength = +contentHeader;

  // Super annoying that the reading the content returns the uncompressed data
  // so we don't know how far we are, so we estimate that the content has a
  // compression ratio of ~15%. Else we will have progress of over 100%
  if (response.headers.get("Content-Encoding")) {
    contentLength *= 7;
  }

  if (response.body === null) {
    const data = await response.arrayBuffer();
    return new Uint8Array(data);
  }

  const reader = response.body.getReader();
  let receivedLength = 0;
  let chunks = [];
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      receivedLength += value.length;
      progress(Math.min(1, receivedLength / contentLength));
    }
  }

  const array = new Uint8Array(receivedLength);
  let position = 0;
  for (let chunk of chunks) {
    array.set(chunk, position);
    position += chunk.length;
  }

  return array;
}

export async function getSaveFile(
  saveId: string,
  signal: AbortSignal | undefined,
  progress: (percent: number) => void
): Promise<Uint8Array> {
  const url = `/api/saves/${saveId}/file`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error(await response.text());
  }

  const array = await streamResponse(response, progress);
  return array;
}

export const appApi = createApi({
  reducerPath: "appApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  tagTypes: ["Saves"],
  endpoints: (builder) => ({
    getProfile: builder.query<ProfileResponse, void>({
      query: () => `/api/profile`,
    }),
    logout: builder.mutation<ProfileResponse, void>({
      query: () => ({
        url: `api/logout`,
        method: "POST",
      }),
    }),
    getAchievements: builder.query<ApiAchievementsResponse, void>({
      query: () => `/api/achievements`,
      providesTags: (_) => ["Saves"],
    }),
    getAchievement: builder.query<AchievementView, string>({
      query: (id) => `/api/achievements/${id}`,
      providesTags: (_) => ["Saves"],
    }),
    newApiKey: builder.mutation<NewKeyResponse, void>({
      query: () => ({
        url: `/api/key`,
        method: "POST",
      }),
    }),
    getUser: builder.query<UserSaves, string>({
      query: (id) => `/api/users/${id}`,
      providesTags: (_) => ["Saves"],
    }),
    getNewestSaves: builder.query<{ saves: SaveFile[] }, void>({
      query: () => `/api/new`,
      providesTags: (_) => ["Saves"],
    }),
    getSave: builder.query<SaveFile, string>({
      query: (saveId) => `/api/saves/${saveId}`,
      providesTags: (_) => ["Saves"],
    }),
    patchSave: builder.mutation<void, SavePatchProps>({
      query: ({ id, ...rest }) => ({
        url: `/api/saves/${id}`,
        method: "PATCH",
        body: rest,
      }),
      invalidatesTags: ["Saves"],
    }),
    deleteSave: builder.mutation<void, string>({
      query: (saveId) => ({
        url: `/api/saves/${saveId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Saves"],
    }),
    getSkanderbegSaves: builder.query<SkanUserSaves[], void>({
      query: () => `/api/skan/user`,
    }),
  }),
});
