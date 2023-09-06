import { epochOf } from "@/lib/dates";
import { fetchOk, fetchOkJson, sendJson } from "@/lib/fetch";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { SaveFile } from "@/server-lib/db";
import type { Achievement, Difficulty } from "@/server-lib/wasm/wasm_app";
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

export async function fetchSaveMeta(saveId: string): Promise<SaveFile> {
  return fetchOk(`/api/saves/${saveId}`).then((x) => x.json());
}

export function useIsPrivileged(userId: string | undefined | null) {
  const { data } = useProfileQuery();
  if (!data || data.kind === "guest") {
    return false;
  }

  return data.user.account === "admin" || data.user.user_id === userId;
}

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
  skanderbegUsers: () => [...pdxKeys.all, "skanderbeg"] as const,
  skanderbegUser: (id: string) => [...pdxKeys.skanderbegUsers(), id] as const,
  users: () => [...pdxKeys.all, "users"] as const,
  user: (id: string) => [...pdxKeys.users(), id] as const,
};

export const useProfileQuery = () => {
  return useQuery({
    queryKey: pdxKeys.profile(),
    queryFn: () => fetchOkJson<ProfileResponse>("/api/profile"),
  });
};

export const useLogoutMutation = () => {
  return useMutation({
    mutationFn: () =>
      fetchOkJson<ProfileResponse>("/api/logout", {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(pdxKeys.profile(), data);
    },
  });
};

export const useNewestSavesQuery = () => {
  return useInfiniteQuery({
    queryKey: pdxKeys.newSaves(),
    queryFn: ({ pageParam }) =>
      fetchOkJson<{ saves: SaveFile[]; cursor: string | undefined }>(
        "/api/new?" +
          new URLSearchParams(
            pageParam
              ? {
                  cursor: pageParam,
                }
              : {},
          ),
      ),
    getNextPageParam: (lastPage, _pages) => lastPage.cursor,
    onSuccess: (data) =>
      data.pages.forEach((page) =>
        page.saves.forEach((x) =>
          queryClient.setQueryData(pdxKeys.save(x.id), x),
        ),
      ),
  });
};

type SaveQueryProps = {
  enabled?: boolean;
};
export const useSaveQuery = (id: string, opts?: Partial<SaveQueryProps>) => {
  const enabled = opts?.enabled ?? true;
  return useQuery({
    queryKey: [...pdxKeys.save(id), { enabled }],
    queryFn: () => fetchSaveMeta(id),
    enabled,
  });
};

export const useAchievementQuery = (id: string) => {
  return useQuery({
    queryKey: pdxKeys.achievement(id),
    queryFn: () => fetchOkJson<AchievementView>(`/api/achievements/${id}`),
  });
};

export const useUserQuery = (userId: string) => {
  return useQuery({
    queryKey: pdxKeys.user(userId),
    queryFn: () => fetchOkJson<UserSaves>(`/api/users/${userId}`),
    onSuccess: (data) =>
      data.saves.forEach((x) =>
        queryClient.setQueryData(pdxKeys.save(x.id), x),
      ),
  });
};

export const invalidateSaves = () => {
  queryClient.invalidateQueries(pdxKeys.newSaves());
  queryClient.invalidateQueries(pdxKeys.saves());
  queryClient.invalidateQueries(pdxKeys.achievements());
  queryClient.invalidateQueries(pdxKeys.users());
};

export const useUserSkanderbegSaves = () => {
  const profileQuery = useProfileQuery();
  const userId =
    profileQuery.data?.kind === "user"
      ? profileQuery.data.user.user_id
      : undefined;
  return useQuery({
    queryKey: pdxKeys.skanderbegUser(userId ?? ""),
    queryFn: () => fetchOkJson<SkanUserSaves[]>(`/api/skan/user`),
    enabled: !!userId,
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
  });
};

export const useSaveDeletion = (id: string) => {
  return useMutation({
    mutationFn: () => fetchOk(`/api/saves/${id}`, { method: "DELETE" }),
    onSuccess: invalidateSaves,
  });
};

export const useNewApiKeyRequest = (onSuccess: (key: string) => void) => {
  return useMutation({
    mutationFn: () =>
      fetchOkJson<NewKeyResponse>(`/api/key`, { method: "POST" }),
    onSuccess: (data) => onSuccess(data.api_key),
  });
};

export const useSavePatch = () => {
  return useMutation({
    mutationFn: ({ id, ...rest }: SavePatchProps) =>
      sendJson(`/api/saves/${id}`, { body: rest, method: "PATCH" }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(pdxKeys.save(id));
    },
  });
};
