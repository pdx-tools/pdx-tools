import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Button } from "@/components/Button";
import { useWhatsNew } from "./useWhatsNew";
import { useWhatsNewActions } from "./whatsNewStore";

export const WhatsNewBanner = () => {
  const { latestRelease, shouldShowBanner } = useWhatsNew();
  const { dismissBanner } = useWhatsNewActions();

  if (!shouldShowBanner || !latestRelease) {
    return null;
  }

  const handleDismiss = () => {
    dismissBanner(latestRelease.release_date);
  };

  return (
    <AnnouncementBar>
      <div className="flex w-full max-w-screen-xl items-center justify-between gap-4 px-4 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg">
            ✨
          </span>
          <div>
            <p className="leading-tight font-medium">
              {latestRelease.headline ?? "A new update just landed!"}
            </p>
            {latestRelease.summary ? (
              <p className="text-xs opacity-90">{latestRelease.summary}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            shape="none"
            className="px-3 py-1 opacity-80 hover:opacity-100"
            onClick={handleDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </AnnouncementBar>
  );
};
