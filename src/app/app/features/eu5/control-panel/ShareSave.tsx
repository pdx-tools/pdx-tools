import { useState } from "react";
import { cx } from "class-variance-authority";
import { useCopyLink } from "@/features/saves/useCopyLink";
import { GameButton } from "@/components/game/Button";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useSession } from "@/features/account";
import { steamLoginHref } from "@/components/layout/auth/SteamButton";
import { hasFeature } from "@/lib/auth";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/events";
import { toast } from "@/lib/toast";
import { pdxApi } from "@/services/appApi";
import {
  useEu5SaveInput,
  useEu5UploadedSaveId,
  useSaveFilename,
  useSetEu5UploadedSaveId,
} from "../store";
import styles from "./ShareSave.module.css";

/**
 * What sharing can be, in the order a player meets them: a guest who
 * must sign in, a player outside the closed beta, a player who can share
 * this file, an upload in flight, and a save that has its permalink.
 */
export type ShareState =
  | { kind: "guest" }
  | { kind: "closed-beta" }
  | { kind: "ready"; share: () => void }
  | { kind: "uploading"; progress: number }
  | { kind: "shared"; saveId: string; origin: "session" | "permalink" };

export function useShareState(): ShareState {
  const session = useSession();
  const save = useEu5SaveInput();
  const filename = useSaveFilename();
  const uploadedSaveId = useEu5UploadedSaveId();
  const setUploadedSaveId = useSetEu5UploadedSaveId();
  const upload = pdxApi.eu5Saves.useAdd();
  const [progress, setProgress] = useState(0);

  // A save opened from its permalink is shared, but the visitor did not
  // share it.
  if (save.kind === "server") {
    return { kind: "shared", saveId: save.saveId, origin: "permalink" };
  } else if (uploadedSaveId !== null) {
    return { kind: "shared", saveId: uploadedSaveId, origin: "session" };
  } else if (upload.isPending) {
    return { kind: "uploading", progress };
  } else if (session.id === undefined) {
    return { kind: "guest" };
  } else if (!hasFeature(session, "eu5-upload")) {
    return { kind: "closed-beta" };
  }

  const share = () => {
    setProgress(0);
    upload.mutate(
      { save, filename, dispatch: setProgress },
      {
        onSuccess: (data) => setUploadedSaveId(data.save_id),
        onError: (error) =>
          toast.error("Could not share the save", {
            description: getErrorMessage(error),
            duration: Infinity,
            closeButton: true,
          }),
      },
    );
  };

  return { kind: "ready", share };
}

/** The state of a download of the shared save, for a visitor on its permalink */
export type DownloadState = { pending: boolean; progress: number; start: () => void };

/**
 * Download the shared save. The file comes back as an `.eu5` that the game
 * loads, and an uncompressed save is converted to the compressed form.
 */
export function useDownloadSave(saveId: string | null): DownloadState {
  const filename = useSaveFilename();
  const download = pdxApi.eu5Saves.useDownload();
  const [progress, setProgress] = useState(0);

  const start = () => {
    if (download.isPending || saveId === null) return;
    setProgress(0);
    download.mutate(
      // Round the progress, so that React renders only when the percent changes.
      { saveId, dispatch: (value) => setProgress(Math.round(value)) },
      {
        onSuccess: (data) => {
          emitEvent({ kind: "Save downloaded", game: "eu5" });
          downloadData(data, filename);
        },
        onError: (error) =>
          toast.error("Could not download the save", {
            description: getErrorMessage(error),
            duration: Infinity,
            closeButton: true,
          }),
      },
    );
  };

  return { pending: download.isPending, progress, start };
}

/** Where a guest signs in and comes back to this page */
export function signInHref() {
  return steamLoginHref(`${window.location.pathname}${window.location.search}`);
}

export const closedBetaHint =
  "Sharing is in a closed beta. Ask on Discord and an admin turns it on for your Steam account.";

/** The share states that this player can use. Only these show the share button. */
export type ShareAction = Extract<ShareState, { kind: "ready" | "uploading" | "shared" }>;

export function isShareAction(share: ShareState): share is ShareAction {
  return share.kind === "ready" || share.kind === "uploading" || share.kind === "shared";
}

/**
 * The size of a labelled button on the save line: 28px there, and 36px on
 * the phone row. The label has no icon, so that the save name keeps its
 * room when Share and Melt both show.
 */
export const saveButtonSize = cx(
  "shrink-0 md:px-2",
  // On a phone the button is 36px in the sheet's top row, and its target is the row's 44px.
  "max-md:relative max-md:h-9 max-md:min-w-11 max-md:px-2 max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-[5px]",
);

/**
 * The share button, for a player who can share. The label changes in place
 * as the share moves on: "Share", then the upload percent, then "Copy
 * link". A guest and a player outside the closed beta find Share in the ⋯
 * menu, so the save line has no button that they cannot use.
 */
export function ShareButton({ share, unavailable }: { share: ShareAction; unavailable: boolean }) {
  switch (share.kind) {
    case "ready":
      return (
        <GameButton
          className={saveButtonSize}
          disabled={unavailable}
          onClick={share.share}
          title={
            unavailable
              ? "Available when the selected save has loaded"
              : "Upload the save and get a link"
          }
        >
          Share
        </GameButton>
      );
    case "uploading":
      return <Uploading progress={share.progress} />;
    case "shared":
      return (
        <CopyLinkButton
          key={share.saveId}
          saveId={share.saveId}
          landed={share.origin === "session"}
        />
      );
  }
}

function Uploading({ progress }: { progress: number }) {
  const percent = Math.round(progress);
  return (
    <GameButton
      disabled
      aria-label={`Uploading, ${percent} percent done`}
      className={cx(
        saveButtonSize,
        "relative overflow-hidden disabled:cursor-progress disabled:opacity-100",
      )}
    >
      <LoadingIcon aria-hidden className="h-3.5 w-3.5 text-game-ink-500" />
      <span className="text-game-ink-300 max-md:hidden">Uploading</span>
      <span className="font-game-num text-[12px] text-game-ink-300 tabular-nums">{percent}%</span>
      {/* The bottom hairline is the track: it fills from left to right. */}
      <span
        aria-hidden
        className={cx("absolute bottom-0 left-0 h-px w-full bg-game-ink-300", styles.track)}
        style={{ transform: `scaleX(${Math.max(0.02, progress / 100)})` }}
      />
    </GameButton>
  );
}

/**
 * Copy the permalink. "Copied" shows in place for a short time. When the
 * upload of this session lands, the button takes one wash, because it is
 * the cue that the link is now there.
 */
function CopyLinkButton({ saveId, landed }: { saveId: string; landed: boolean }) {
  const path = `/eu5/saves/${saveId}`;
  const { copied, copy } = useCopyLink(path);
  return (
    <GameButton
      className={cx(saveButtonSize, landed && styles.landed)}
      onClick={() => void copy()}
      title={new URL(path, window.location.origin).toString()}
      aria-live="polite"
    >
      {copied ? "Copied" : "Copy link"}
    </GameButton>
  );
}
