import { epochOf } from "@/lib/dates";
import { fetchOk, fetchOkJson, sendJson } from "@/lib/fetch";
import {
  QueryClient,
  UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { SaveFile } from "@/server-lib/db";
import type { Achievement, Difficulty } from "@/server-lib/wasm/wasm_app";
import { Eu4Worker } from "@/features/eu4/worker";
import { SavePostResponse, UploadMetadaInput } from "@/server-lib/models";
import { createCompressionWorker } from "@/features/compress";
export type { Achievement, SaveFile, Difficulty as AchievementDifficulty };

export type GameDifficulty = SaveFile["game_difficulty"];
export type WeightedScore = SaveFile["weighted_score"];

export type UserSaves = {
  saves: SaveFile[];
  user_info: PublicUserInfo | null;
};

export type PublicUserInfo = {
  user_id: string;
  user_name: string | null;
  created_on: string;
};

export type PrivateUserInfo = {
  user_id: string;
  steam_id: string;
  account: "free" | "admin";
};

export type ProfileResponse =
  | {
      kind: "guest";
    }
  | {
      kind: "user";
      user: PrivateUserInfo;
    };

type LoggedInUser = Extract<ProfileResponse, { kind: "user" }>;

export type ApiAchievementsResponse = {
  achievements: Achievement[];
  saves: SaveFile[];
};

export type AchievementView = {
  achievement: Achievement;
  saves: SaveFile[];
};

export type NewKeyResponse = {
  api_key: string;
};

export type RankedSaveFile = { rank: number } & SaveFile;

export type SavePatchProps = {
  id: string;
  aar?: string;
  filename?: string;
};

export type SkanUserSaves = {
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
};

type ProfileQuery = UseQueryResult<ProfileResponse>;
export const sessionSelect = {
  isLoggedIn: (
    session: ProfileQuery,
  ): session is ProfileQuery & { data: LoggedInUser } =>
    session.data?.kind === "user",

  isAdmin: (session: ProfileQuery) =>
    sessionSelect.isLoggedIn(session) && session.data.user.account == "admin",

  isPrivileged: (
    session: ProfileQuery,
    { user_id }: Partial<{ user_id: string }>,
  ) =>
    sessionSelect.isLoggedIn(session) &&
    (session.data.user.account == "admin" ||
      session.data.user.user_id === user_id),
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
});

export const pdxKeys = {
  all: ["pdx"] as const,
  profile: () => [...pdxKeys.all, "profile"] as const,
  newSaves: () => [...pdxKeys.all, "new-saves"] as const,
  saves: () => [...pdxKeys.all, "saves"] as const,
  save: (id: string) => [...pdxKeys.saves(), id] as const,
  achievements: () => [...pdxKeys.all, "achievements"] as const,
  achievement: (id: string) => [...pdxKeys.achievements(), id] as const,
  skanderbegUser: () => [...pdxKeys.all, "skanderbeg"] as const,
  users: () => [...pdxKeys.all, "users"] as const,
  user: (id: string) => [...pdxKeys.users(), id] as const,
};

export const pdxApi = {
  achievement: {
    useGet: (id: string) =>
      useQuery({
        queryKey: pdxKeys.achievement(id),
        queryFn: () => fetchOkJson<AchievementView>(`/api/achievements/${id}`),
      }),
  },

  apiKey: {
    useGenerateKey: (onSuccess: (key: string) => void) =>
      useMutation({
        mutationFn: () =>
          fetchOkJson<NewKeyResponse>(`/api/key`, { method: "POST" }),
        onSuccess: (data) => onSuccess(data.api_key),
      }),
  },

  session: {
    useCurrent: () =>
      useQuery({
        queryKey: pdxKeys.profile(),
        queryFn: () => fetchOkJson<ProfileResponse>("/api/profile"),
        gcTime: Infinity,
      }),

    useLogout: () =>
      useMutation({
        mutationFn: () =>
          fetchOkJson<ProfileResponse>("/api/logout", {
            method: "POST",
          }),
        onSuccess: (data) => {
          queryClient.setQueryData(pdxKeys.profile(), data);
        },
      }),

    useSkanderbegSaves: () =>
      useQuery({
        queryKey: pdxKeys.skanderbegUser(),
        queryFn: () => fetchOkJson<SkanUserSaves[]>(`/api/skan/user`),
        select: (data) => {
          const saves = data.map((obj) => ({
            hash: obj.hash,
            timestamp: obj.timestamp,
            timestamp_epoch: epochOf(obj.timestamp),
            name: obj.customname || obj.name,
            uploaded_by: obj.uploaded_by,
            player: obj.player,
            date: obj.date,
            version: obj.version,
          }));
          saves.sort((a, b) => b.timestamp_epoch - a.timestamp_epoch);
          return saves;
        },
      }),
  },

  saves: {
    useNewest: () =>
      useInfiniteQuery({
        queryKey: pdxKeys.newSaves(),
        queryFn: ({ pageParam }) =>
          fetchOkJson<{ saves: SaveFile[]; cursor: string | undefined }>(
            "/api/new" +
              (!pageParam
                ? ""
                : `?${new URLSearchParams({
                    cursor: pageParam,
                  })}`),
          ),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage, _pages) => lastPage.cursor,
      }),

    useRebalance: () =>
      useMutation({
        mutationFn: () => fetchOk("/api/admin/rebalance", { method: "POST" }),
        onSuccess: invalidateSaves,
      }),

    useAdd: () =>
      useMutation({
        onSuccess: invalidateSaves,
        mutationFn: async ({
          worker,
          dispatch,
          values,
          signal,
        }: {
          worker: Eu4Worker;
          dispatch: (arg: { kind: "progress"; progress: number }) => void;
          values: { aar?: string; filename: string };
          signal?: AbortSignal;
        }) => {
          const compression = createCompressionWorker();

          try {
            const data = new FormData();
            dispatch({ kind: "progress", progress: 5 });

            const rawFileData = await worker.getRawData();
            dispatch({ kind: "progress", progress: 10 });

            const compressProgress = (portion: number) => {
              const progress = 10 + (portion * 100) / (100 / (50 - 10));
              dispatch({ kind: "progress", progress });
            };

            const fileData = await compression.compress(
              new Uint8Array(rawFileData),
              compressProgress,
            );
            dispatch({ kind: "progress", progress: 50 });

            const blob = new Blob([fileData.data], {
              type: fileData.contentType,
            });

            const metadata = JSON.stringify({
              aar: values.aar,
              filename: values.filename,
              content_type: fileData.contentType,
            } satisfies UploadMetadaInput);

            data.append("file", blob);
            data.append("metadata", metadata);

            return new Promise<SavePostResponse>(async (resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("POST", "/api/saves");

              request.upload.addEventListener("progress", function (e) {
                const percent_complete = (e.loaded / e.total) * 100;
                dispatch({
                  kind: "progress",
                  progress: 50 + percent_complete / 2,
                });
              });

              request.addEventListener("load", function (e) {
                if (request.status >= 200 && request.status < 300) {
                  const response: SavePostResponse = JSON.parse(
                    request.response,
                  );
                  resolve(response);
                } else {
                  try {
                    const err = JSON.parse(request.response).msg;
                    reject(new Error(err));
                  } catch (ex) {
                    reject(new Error(`unknown error: ${request.response}`));
                  }
                }
              });

              signal?.addEventListener("abort", () => {
                request.abort();
              });

              const onError = () => {
                reject(new Error("upload request errored"));
              };

              const onAbort = () => {
                reject(new Error("upload request aborted"));
              };

              request.addEventListener("error", onError);
              request.upload.addEventListener("error", onError);
              request.addEventListener("abort", onAbort);
              request.upload.addEventListener("abort", onAbort);

              request.send(data);
            });
          } finally {
            compression.release();
          }
        },
      }),
  },

  save: {
    useGet: (id: string, opts?: Partial<{ enabled?: boolean }>) => {
      const enabled = opts?.enabled ?? true;
      return useQuery({
        queryKey: [...pdxKeys.save(id), { enabled }],
        queryFn: () => fetchOkJson<SaveFile>(`/api/saves/${id}`),
        enabled,
      });
    },

    useDelete: () =>
      useMutation({
        mutationFn: (id: string) =>
          fetchOk(`/api/saves/${id}`, { method: "DELETE" }),
        onSuccess: invalidateSaves,
      }),

    useUpdate: () =>
      useMutation({
        mutationFn: ({ id, ...rest }: SavePatchProps) =>
          sendJson(`/api/saves/${id}`, { body: rest, method: "PATCH" }),
        onSuccess: (_, { id }) => {
          queryClient.invalidateQueries({ queryKey: pdxKeys.save(id) });
        },
      }),
  },

  user: {
    useGet: (userId: string) =>
      useQuery({
        queryKey: pdxKeys.user(userId),
        queryFn: () => fetchOkJson<UserSaves>(`/api/users/${userId}`),
      }),
  },
};

export const invalidateSaves = () => {
  queryClient.invalidateQueries({ queryKey: pdxKeys.newSaves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.saves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.achievements() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.users() });
};
