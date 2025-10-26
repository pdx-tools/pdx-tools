import { create } from "zustand";
import { persist } from "zustand/middleware";

type UpdatesClientStore = {
  lastSeenReleaseDate?: string;
  bannerDismissedOn?: string;
  actions: {
    markLatestSeen: (date: string) => void;
    dismissBanner: (date: string) => void;
  };
};

const useWhatsNewStore = create<UpdatesClientStore>()(
  persist(
    (set) => ({
      actions: {
        markLatestSeen: (date: string) => set({ lastSeenReleaseDate: date }),
        dismissBanner: (date: string) => set({ bannerDismissedOn: date }),
      },
    }),
    {
      name: "whats-new-store",
      skipHydration: true,
      partialize: ({ actions: _actions, ...rest }) => rest,
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("failed to rehydrate whats-new-store", error);
          } else {
            useWhatsNewStore.setState({
              lastSeenReleaseDate:
                state?.lastSeenReleaseDate ??
                new Date().toISOString().slice(0, 10),
            });
          }
        };
      },
    },
  ),
);

export const useWhatsNewActions = () =>
  useWhatsNewStore((state) => state.actions);
export const rehydrateWhatsNewStore = () =>
  useWhatsNewStore.persist.rehydrate();
export const useWhatsNewLastSeenReleaseDate = () =>
  useWhatsNewStore((state) => state.lastSeenReleaseDate);
export const useWhatsNewBannerDismissedOn = () =>
  useWhatsNewStore((state) => state.bannerDismissedOn);
