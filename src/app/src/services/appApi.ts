import { epochOf } from "@/lib/dates";
import { fetchOk, fetchOkJson } from "@/lib/fetch";
import { GameDifficulty, SavePatch } from "@/server-lib/save-parsing-types";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
export type { GameDifficulty };

export type SaveEncoding = "text" | "textzip" | "binzip" | "binary";

export type WeightedScore = {
  days: number;
  date: string;
};

export type GameVersion = SavePatch;

export type SaveFile = {
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
};

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
  user_name: string | null;
  account: "free" | "admin";
  created_on: string;
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

export type AchievementDifficulty =
  | "VeryEasy"
  | "Easy"
  | "Medium"
  | "Hard"
  | "VeryHard"
  | "Insane";

export type Achievement = {
  id: number;
  name: string;
  description: string;
  difficulty: AchievementDifficulty;
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
    queryFn: () =>
      fetchOkJson("/api/profile").then((x) => x as ProfileResponse),
  });
};

export const useLogoutMutation = () => {
  return useMutation({
    mutationFn: () =>
      fetchOkJson("/api/logout", {
        method: "POST",
      }).then((x) => x as ProfileResponse),
    onSuccess: (data) => {
      queryClient.setQueryData(pdxKeys.profile(), data);
    },
  });
};

export const useNewestSavesQuery = () => {
  return useInfiniteQuery({
    queryKey: pdxKeys.newSaves(),
    queryFn: ({ pageParam }) =>
      fetchOkJson(
        "/api/new?" +
          new URLSearchParams(
            pageParam
              ? {
                  cursor: pageParam,
                }
              : {}
          )
      ).then((x) => x as { saves: SaveFile[]; cursor: string | undefined }),
    getNextPageParam: (lastPage, _pages) => lastPage.cursor,
    onSuccess: (data) =>
      data.pages.forEach((page) =>
        page.saves.forEach((x) =>
          queryClient.setQueryData(pdxKeys.save(x.id), x)
        )
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
    queryFn: () =>
      fetchOkJson(`/api/achievements/${id}`).then((x) => x as AchievementView),
  });
};

export const useUserQuery = (userId: string) => {
  return useQuery({
    queryKey: pdxKeys.user(userId),
    queryFn: () =>
      fetchOkJson(`/api/users/${userId}`).then((x) => x as UserSaves),
    onSuccess: (data) =>
      data.saves.forEach((x) =>
        queryClient.setQueryData(pdxKeys.save(x.id), x)
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
    queryFn: () =>
      fetchOkJson(`/api/skan/user`).then((x) => x as SkanUserSaves[]),
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
      fetchOkJson(`/api/key`, { method: "POST" }).then(
        (x) => x as NewKeyResponse
      ),
    onSuccess: (data) => onSuccess(data.api_key),
  });
};

export const useSavePatch = () => {
  return useMutation({
    mutationFn: ({ id, ...rest }: SavePatchProps) =>
      fetchOkJson(`/api/saves/${id}`, {
        method: "PATCH",
        body: JSON.stringify(rest),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(pdxKeys.save(id));
    },
  });
};
