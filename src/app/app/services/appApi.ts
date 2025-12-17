import { fetchOk, fetchOkJson, sendJson } from "@/lib/fetch";
import type { QueryClient } from "@tanstack/react-query";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Achievement, Difficulty } from "@/wasm/wasm_app";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { SavePostResponse, UploadMetadaInput } from "@/server-lib/models";
import { createCompressionWorker } from "@/features/compress";
import type { PdxSession } from "@/server-lib/auth/session";
import type { NewestSaveResponse } from "@/routes/api.new";
import type { UserSaves } from "@/server-lib/db";
import type { SaveResponse } from "@/routes/api.saves.$saveId";
import type { AchievementApiResponse } from "@/routes/api.achievements.$achievementId";
import { log } from "@/lib/log";
export type { GameDifficulty } from "@/server-lib/save-parsing-types";
export type { Achievement, Difficulty as AchievementDifficulty };

export type PublicUserInfo = {
  user_id: string;
  user_name: string | null;
  created_on: string;
};

export type NewKeyResponse = {
  api_key: string;
};

export type SavePatchProps = {
  id: string;
  aar?: string;
  filename?: string;
  leaderboard_qualified?: boolean;
};

export const pdxKeys = {
  all: ["pdx"] as const,
  profile: () => [...pdxKeys.all, "profile"] as const,
  newSaves: () => [...pdxKeys.all, "new-saves"] as const,
  saves: () => [...pdxKeys.all, "saves"] as const,
  save: (id: string) => [...pdxKeys.saves(), id] as const,
  achievements: () => [...pdxKeys.all, "achievements"] as const,
  achievement: (id: string) => [...pdxKeys.achievements(), id] as const,
  users: () => [...pdxKeys.all, "users"] as const,
  user: (id: string) => [...pdxKeys.users(), id] as const,
};

export const pdxApi = {
  achievement: {
    useGet: (id: string) =>
      useSuspenseQuery({
        queryKey: pdxKeys.achievement(id),
        queryFn: () =>
          fetchOkJson<AchievementApiResponse>(`/api/achievements/${id}`),
        select: (data) => ({
          ...data,
          saves: data.saves.map((x, i) => ({ ...x, rank: i + 1 })),
        }),
      }),
  },

  apiKey: {
    useGenerateKey: () =>
      useMutation({
        mutationFn: () =>
          fetchOkJson<NewKeyResponse>(`/api/key`, { method: "POST" }),
      }),
  },

  session: {
    useCurrent: () =>
      useSuspenseQuery({
        queryKey: pdxKeys.profile(),
        queryFn: () => fetchOkJson<PdxSession>("/api/profile"),
      }),
  },

  saves: {
    useNewest: () =>
      useSuspenseInfiniteQuery({
        queryKey: pdxKeys.newSaves(),
        queryFn: ({ pageParam }) =>
          fetchOkJson<NewestSaveResponse>(
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

    useRebalance: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: () => fetchOk("/api/admin/rebalance", { method: "POST" }),
        onSuccess: invalidateSaves(queryClient),
      });
    },

    useReprocess: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (body: unknown) =>
          sendJson("/api/admin/reprocess", { body }),
        onSuccess: invalidateSaves(queryClient),
      });
    },
    useAdd: () => {
      const queryClient = useQueryClient();
      return useMutation({
        onSuccess: invalidateSaves(queryClient),
        mutationFn: async ({
          dispatch,
          values,
          signal,
        }: {
          dispatch: (arg: { kind: "progress"; progress: number }) => void;
          values: { aar?: string; filename: string };
          signal?: AbortSignal;
        }) => {
          const compression = createCompressionWorker();

          try {
            const data = new FormData();
            dispatch({ kind: "progress", progress: 5 });

            const worker = getEu4Worker();
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

            return new Promise<SavePostResponse>((resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("POST", "/api/saves");

              request.upload.addEventListener("progress", function (e) {
                const percent_complete = (e.loaded / e.total) * 100;
                dispatch({
                  kind: "progress",
                  progress: 50 + percent_complete / 2,
                });
              });

              request.addEventListener("load", function () {
                if (request.status >= 200 && request.status < 300) {
                  const response: SavePostResponse = JSON.parse(
                    request.response,
                  );
                  resolve(response);
                } else {
                  try {
                    const err = JSON.parse(request.response).msg;
                    reject(new Error(err));
                  } catch (e) {
                    log("Failed to parse upload error response", e);
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
      });
    },
  },

  save: {
    useGet: (id: string, opts?: Partial<{ enabled?: boolean }>) => {
      const enabled = opts?.enabled ?? true;
      return useQuery({
        queryKey: [...pdxKeys.save(id), { enabled }],
        queryFn: () => fetchOkJson<SaveResponse>(`/api/saves/${id}`),
        enabled,
      });
    },

    useDelete: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (id: string) =>
          fetchOk(`/api/saves/${id}`, { method: "DELETE" }),
        onSuccess: invalidateSaves(queryClient),
      });
    },

    useUpdate: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ id, ...rest }: SavePatchProps) =>
          sendJson(`/api/saves/${id}`, { body: rest, method: "PATCH" }),
        onSuccess: (_, { id, leaderboard_qualified }) => {
          queryClient.invalidateQueries({ queryKey: pdxKeys.save(id) });

          // Refresh leaderboards if qualification status changed
          if (leaderboard_qualified !== undefined) {
            queryClient.invalidateQueries({ queryKey: pdxKeys.achievements() });
          }
        },
      });
    },

    useOgMutation: () =>
      useMutation({
        mutationFn: ({ id }: { id: string }) =>
          sendJson(`/api/admin/og`, { body: { saveId: id } }),
      }),
  },

  user: {
    useGet: (userId: string) =>
      useSuspenseQuery({
        queryKey: pdxKeys.user(userId),
        queryFn: () => fetchOkJson<UserSaves>(`/api/users/${userId}`),
      }),
  },
};

export const invalidateSaves = (queryClient: QueryClient) => () => {
  queryClient.invalidateQueries({ queryKey: pdxKeys.newSaves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.saves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.achievements() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.users() });
};
