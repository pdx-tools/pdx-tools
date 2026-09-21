import { fetchOk, fetchOkJson, sendJson, sendJsonAs } from "@/lib/fetch";
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
import type { FeedResponse } from "@/routes/api.feed";
import type { CampaignResponse } from "@/routes/api.campaign";
import type { FeedGame } from "@/server-lib/fn/feed";
import type { UserSaves } from "@/server-lib/db";
import type { SaveResponse } from "@/server-lib/fn/save";
import type { AchievementApiResponse } from "@/routes/api.achievements.$achievementId";
import { log } from "@/lib/log";
import type { Eu5SaveInput } from "@/features/eu5/store/types";
import type {
  FeatureChangeInput,
  UserFeaturesResponse,
} from "@/routes/api.admin.users.$userId.features";
export type { GameDifficulty } from "@/server-lib/save-parsing-types";
export type { Achievement, Difficulty as AchievementDifficulty };

/**
 * Read the file that was parsed. The read fails when the file changed on disk
 * after the parse, so an upload never sends a save that the user did not see.
 */
async function readParsedFile(file: File) {
  try {
    return await file.arrayBuffer();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotReadableError") {
      throw new Error("The save file changed on disk after it was opened. Open the save again.");
    }
    throw error;
  }
}

/**
 * POST a save with XMLHttpRequest, as fetch does not report upload progress.
 * `onProgress` receives the uploaded portion, from 0 to 1.
 */
function xhrUpload({
  url,
  body,
  headers = {},
  signal,
  onProgress,
}: {
  url: string;
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress: (portion: number) => void;
}) {
  return new Promise<SavePostResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.response) as SavePostResponse);
        return;
      }

      try {
        reject(new Error(JSON.parse(request.response).msg));
      } catch (e) {
        log("Failed to parse upload error response", e);
        reject(new Error(`Upload failed (${request.status}): ${request.response}`));
      }
    });

    const onError = () => reject(new Error("upload request errored"));
    const onAbort = () => reject(new Error("upload request aborted"));
    const onTimeout = () => reject(new Error("upload request timed out"));
    request.addEventListener("error", onError);
    request.upload.addEventListener("error", onError);
    request.addEventListener("abort", onAbort);
    request.upload.addEventListener("abort", onAbort);
    request.addEventListener("timeout", onTimeout);

    if (signal?.aborted) {
      reject(new Error("upload request aborted"));
      return;
    }
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });
}

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

export type FeedQuery = { game?: FeedGame; pageSize?: number };

export function fetchFeedPage(params: FeedQuery, cursor?: string) {
  const search = new URLSearchParams();
  if (params.game) search.set("game", params.game);
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (cursor) search.set("cursor", cursor);
  const query = search.size > 0 ? `?${search}` : "";
  return fetchOkJson<FeedResponse>(`/api/feed${query}`);
}

export const pdxKeys = {
  all: ["pdx"] as const,
  profile: () => [...pdxKeys.all, "profile"] as const,
  feeds: () => [...pdxKeys.all, "feed"] as const,
  feed: (params: FeedQuery) => [...pdxKeys.feeds(), params] as const,
  campaign: (game: FeedGame, key: string) => [...pdxKeys.feeds(), "campaign", game, key] as const,
  saves: () => [...pdxKeys.all, "saves"] as const,
  save: (id: string) => [...pdxKeys.saves(), id] as const,
  achievements: () => [...pdxKeys.all, "achievements"] as const,
  achievement: (id: string) => [...pdxKeys.achievements(), id] as const,
  users: () => [...pdxKeys.all, "users"] as const,
  user: (id: string) => [...pdxKeys.users(), id] as const,
  userFeatures: (id: string) => [...pdxKeys.user(id), "features"] as const,
};

export const pdxApi = {
  achievement: {
    useGet: (id: string) =>
      useSuspenseQuery({
        queryKey: pdxKeys.achievement(id),
        queryFn: () => fetchOkJson<AchievementApiResponse>(`/api/achievements/${id}`),
        select: (data) => ({
          ...data,
          saves: data.saves.map((x, i) => ({ ...x, rank: i + 1 })),
        }),
      }),
  },

  apiKey: {
    useGenerateKey: () =>
      useMutation({
        mutationFn: () => fetchOkJson<NewKeyResponse>(`/api/key`, { method: "POST" }),
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
    useFeed: (params: FeedQuery) =>
      useSuspenseInfiniteQuery({
        queryKey: pdxKeys.feed(params),
        queryFn: ({ pageParam }) => fetchFeedPage(params, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage, _pages) => lastPage.cursor,
      }),

    useCampaign: (game: FeedGame, key: string, enabled: boolean) =>
      useQuery({
        queryKey: pdxKeys.campaign(game, key),
        queryFn: () =>
          fetchOkJson<CampaignResponse>(`/api/campaign?${new URLSearchParams({ game, key })}`),
        enabled,
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
        mutationFn: (body: unknown) => sendJson("/api/admin/reprocess", { body }),
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

            return await xhrUpload({
              url: "/api/saves",
              body: data,
              signal,
              onProgress: (portion) => dispatch({ kind: "progress", progress: 50 + portion * 50 }),
            });
          } finally {
            compression.release();
          }
        },
      });
    },
  },

  eu5Saves: {
    useAdd: () => {
      const queryClient = useQueryClient();
      return useMutation({
        onSuccess: invalidateSaves(queryClient),
        mutationFn: async ({
          save,
          filename,
          dispatch,
          signal,
        }: {
          save: Eu5SaveInput;
          filename: string;
          dispatch: (progress: number) => void;
          signal?: AbortSignal;
        }) => {
          if (save.kind === "server") throw new Error("This EU5 save is already uploaded");
          const file = save.kind === "handle" ? await save.file.getFile() : save.file;
          const compression = createCompressionWorker();
          try {
            dispatch(5);
            const source = new Uint8Array(await readParsedFile(file));
            dispatch(10);
            const compressed = await compression.compress(source, (portion) =>
              dispatch(10 + portion * 40),
            );
            if (compressed.data.byteLength > 90 * 1024 * 1024) {
              throw new Error("Compressed save exceeds the 90 MiB upload limit");
            }

            // The save is the bare request body so that the server can stream
            // it into storage. The metadata travels in headers.
            const body = new Blob([compressed.data], { type: compressed.contentType });

            return await xhrUpload({
              url: "/api/eu5/saves",
              body,
              headers: {
                "Content-Type": compressed.contentType,
                "pdx-tools-filename": encodeURIComponent(filename),
              },
              signal,
              onProgress: (portion) => dispatch(50 + portion * 50),
            });
          } finally {
            compression.release();
          }
        },
      });
    },
  },

  eu5Save: {
    useDelete: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (id: string) => fetchOk(`/api/eu5/saves/${id}`, { method: "DELETE" }),
        onSuccess: invalidateSaves(queryClient),
      });
    },
  },

  admin: {
    // The features granted to a user. Admin only: the query stays disabled
    // for everyone else so the page never asks a question it cannot answer.
    useUserFeatures: (userId: string, opts?: Partial<{ enabled?: boolean }>) =>
      useQuery({
        queryKey: pdxKeys.userFeatures(userId),
        queryFn: () => fetchOkJson<UserFeaturesResponse>(`/api/admin/users/${userId}/features`),
        enabled: opts?.enabled ?? true,
      }),

    useSetUserFeature: (userId: string) => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (change: FeatureChangeInput) =>
          sendJsonAs<UserFeaturesResponse>(`/api/admin/users/${userId}/features`, {
            method: "PATCH",
            body: change,
          }),
        onSuccess: (data) => {
          queryClient.setQueryData(pdxKeys.userFeatures(userId), data);
        },
      });
    },
  },

  save: {
    useGet: (id: string, opts?: Partial<{ enabled?: boolean }>) => {
      const enabled = opts?.enabled ?? true;
      return useQuery({
        queryKey: pdxKeys.save(id),
        queryFn: () => fetchOkJson<SaveResponse>(`/api/saves/${id}`),
        enabled,
      });
    },

    useDelete: () => {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (id: string) => fetchOk(`/api/saves/${id}`, { method: "DELETE" }),
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
        mutationFn: ({ id }: { id: string }) => sendJson(`/api/admin/og`, { body: { saveId: id } }),
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
  queryClient.invalidateQueries({ queryKey: pdxKeys.feeds() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.saves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.achievements() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.users() });
};
