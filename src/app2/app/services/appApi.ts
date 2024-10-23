import { epochOf } from "@/lib/dates";
import { fetchOk, fetchOkJson, sendJson } from "@/lib/fetch";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  type UseQueryResult,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Achievement, Difficulty } from "@/server-lib/wasm/wasm_app";
import type { Eu4Worker } from "@/features/eu4/worker";
import type { SavePostResponse, UploadMetadaInput } from "@/server-lib/models";
import { createCompressionWorker } from "@/features/compress";
import { identify } from "@/lib/events";
import { captureException } from "@/lib/captureException";
import { PdxSession } from "@/server-lib/auth/session";
import { SaveResponse } from "@/routes/api/saves.$saveId";
import { AchievementResponse } from "@/server-lib/fn/achievement";
import { NewestSaveResponse } from "@/routes/api/new";
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

export const sessionSelect = {
  isLoggedIn: (
    session: PdxSession,
  ): session is Extract<PdxSession, { kind: "user" }> =>
    session.kind === "user",

  isAdmin: (session: PdxSession) =>
    sessionSelect.isLoggedIn(session) && session.account == "admin",

  isPrivileged: (
    session: PdxSession,
    { user_id }: Partial<{ user_id: string }>,
  ) =>
    sessionSelect.isLoggedIn(session) &&
    (session.account == "admin" || session.userId === user_id),
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
  queryCache: new QueryCache({
    onError(error, _query) {
      captureException(error);
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _variables, _context, _mutation) {
      captureException(error);
    },
  }),
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
      useSuspenseQuery({
        queryKey: pdxKeys.achievement(id),
        queryFn: () =>
          fetchOkJson<AchievementResponse>(`/api/achievements/${id}`),
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

    useRebalance: () =>
      useMutation({
        mutationFn: () => fetchOk("/api/admin/rebalance", { method: "POST" }),
        onSuccess: invalidateSaves,
      }),

    useReprocess: () =>
      useMutation({
        mutationFn: (body: any) => sendJson("/api/admin/reprocess", { body }),
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
        queryFn: () => fetchOkJson<SaveResponse>(`/api/saves/${id}`),
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

    useOgMutation: () =>
      useMutation({
        mutationFn: ({ id }: { id: string }) =>
          sendJson(`/api/admin/og`, { body: { saveId: id } }),
      }),
  },
};

export const invalidateSaves = () => {
  queryClient.invalidateQueries({ queryKey: pdxKeys.newSaves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.saves() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.achievements() });
  queryClient.invalidateQueries({ queryKey: pdxKeys.users() });
};
