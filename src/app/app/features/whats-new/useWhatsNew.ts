import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOkJson } from "@/lib/fetch";
import { updateReleaseFileSchema, updatesIndexSchema } from "./types";
import type { UpdateRelease } from "./types";
import {
  rehydrateWhatsNewStore,
  useWhatsNewBannerDismissedOn,
  useWhatsNewLastSeenReleaseDate,
} from "./whatsNewStore";
import { useIsClient } from "@/hooks/useIsClient";

const MAX_RELEASES = 12;
const QUERY_KEY_INDEX = ["whats-new", "index"] as const;
const QUERY_KEY_RELEASES = ["whats-new", "releases"] as const;

async function fetchIndex(): Promise<string[]> {
  const raw = await fetchOkJson<unknown>("/whats-new.json");
  const parsed = updatesIndexSchema.parse(raw);
  return parsed.map((date) => date.trim()).filter(Boolean);
}

async function fetchRelease(date: string): Promise<UpdateRelease> {
  const raw = await fetchOkJson<unknown>(`/whats-new/${date}.json`);
  const parsed = updateReleaseFileSchema.parse(raw);
  return {
    ...parsed,
    release_date: date,
  };
}

async function fetchReleases(
  dates: readonly string[],
): Promise<UpdateRelease[]> {
  const limitedDates = dates.slice(0, MAX_RELEASES);
  const releases = await Promise.all(limitedDates.map(fetchRelease));
  return releases;
}

export const useWhatsNew = () => {
  const lastSeenReleaseDate = useWhatsNewLastSeenReleaseDate();
  const bannerDismissedOn = useWhatsNewBannerDismissedOn();
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) {
      return;
    }
    rehydrateWhatsNewStore();
  }, [isClient]);

  const indexQuery = useQuery({
    queryKey: QUERY_KEY_INDEX,
    queryFn: fetchIndex,
    staleTime: 5 * 60 * 1000,
    enabled: isClient,
  });

  const [releaseDates, setReleaseDates] = useState<string[]>([]);
  const newReleaseDates = indexQuery.data?.filter(
    (x) => x > (lastSeenReleaseDate ?? ""),
  );
  if ((newReleaseDates?.length ?? 0) > releaseDates.length) {
    setReleaseDates(newReleaseDates ?? []);
  }

  const latestReleaseDate = releaseDates[0];

  const releasesQuery = useQuery({
    queryKey: [...QUERY_KEY_RELEASES, { releaseDates }] as const,
    queryFn: () => fetchReleases(releaseDates),
    enabled: isClient && releaseDates.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: [],
  });

  const releases = releasesQuery.data ?? [];
  const latestRelease = releases.find(
    (release) => release.release_date === latestReleaseDate,
  );

  const error = indexQuery.error ?? releasesQuery.error;

  const hasUnread = releaseDates.length > 0;
  const shouldShowBanner =
    !!latestRelease &&
    !!latestRelease.learn_more_url &&
    bannerDismissedOn !== latestRelease.release_date;

  return {
    releases,
    latestRelease,
    hasUnread,
    shouldShowBanner,
    isLoading: indexQuery.isPending || releasesQuery.isPending,
    error,
  };
};
