import { useState } from "react";
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
