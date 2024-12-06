import { fetchOk, fetchOkJson, sendJson } from "@/lib/fetch";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Achievement, Difficulty } from "@/server-lib/wasm/wasm_app";
import type { Eu4Worker } from "@/features/eu4/worker";
import type { SavePostResponse, UploadMetadaInput } from "@/server-lib/models";
import { PdxSession } from "@/server-lib/auth/cookie";
import { NewestSaveResponse } from "@/routes/api.new";
import { UserSaves } from "@/server-lib/db";
import { SaveResponse } from "@/routes/api.saves.$saveId";
import { AchievementApiResponse } from "@/routes/api.achievements.$achievementId";
import { upload } from "@/lib/uploader";
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
          dispatch({ kind: "progress", progress: 5 });

          const response = await upload({
            url: "/api/saves",
            data: await worker.getRawData(),
            fileMetadata: (metadata) =>
              ({
                aar: values.aar,
                filename: values.filename,
                content_type: metadata.contentType,
              }) satisfies UploadMetadaInput,
            signal,
            dispatch,
          });

          return JSON.parse(response as string) as SavePostResponse;
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
        onSuccess: (_, { id }) => {
          queryClient.invalidateQueries({ queryKey: pdxKeys.save(id) });
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
