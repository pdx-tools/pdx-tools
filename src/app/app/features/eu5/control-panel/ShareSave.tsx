import { useState } from "react";
import { cx } from "class-variance-authority";
import { ArrowDownTrayIcon, CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import { useCopyLink } from "@/features/saves/useCopyLink";
import { Link } from "@/components/Link";
import { Tooltip } from "@/components/Tooltip";
import { GameButton } from "@/components/game/Button";
import { EntityName, entityLinkControl } from "../components/EntityName";
import { useSession } from "@/features/account";
import { steamLoginHref } from "@/components/layout/auth/SteamButton";
import { hasFeature } from "@/lib/auth";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { DISCORD_INVITE_URL } from "@/lib/links";
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
import { footLabel, footRow } from "./footRow";
import styles from "./ShareSave.module.css";

/**
 * What the share row can be, in the order a player meets them: a guest who
 * must sign in, a player outside the closed beta, a player who can share
 * this file, an upload in flight, and a save that has its permalink.
 */
export type ShareState =
  | { kind: "guest" }
  | { kind: "closed-beta" }
  | { kind: "ready"; share: () => void }
  | { kind: "uploading"; progress: number; stage: "compressing" | "uploading" }
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
    return {
      kind: "uploading",
      progress,
      // The mutation compresses in the first half and uploads in the second.
      stage: progress < 50 ? "compressing" : "uploading",
    };
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

/**
 * The Share row at the foot of the control panel.
 *
 * Sharing has no settings, so it takes no dialog: the row states the one
 * consequence ("public permalink") beside the one control that commits to
 * it. While the upload runs, the row's own hairline fills as the track, and
 * when it lands the permalink and its Copy button take the same row, so the
 * eye that watched the track fill is already where the link appears.
 */
export function ShareRow() {
  const state = useShareState();

  return (
    <div
      className={cx(
        footRow,
        "relative",
        state.kind === "shared" && state.origin === "session" && styles.landed,
      )}
    >
      <span className={footLabel}>Share</span>
      {state.kind === "shared" ? (
        <Shared saveId={state.saveId} origin={state.origin} />
      ) : state.kind === "uploading" ? (
        <Uploading state={state} />
      ) : state.kind === "ready" ? (
        <Ready onShare={state.share} />
      ) : state.kind === "closed-beta" ? (
        <ClosedBeta />
      ) : (
        <Guest />
      )}
    </div>
  );
}

const status = "min-w-0 flex-1 truncate font-game-ui text-[12px] text-game-ink-500";

function Ready({ onShare }: { onShare: () => void }) {
  return (
    <GameButton variant="commit" onClick={onShare}>
      Share save
    </GameButton>
  );
}

function Uploading({ state }: { state: Extract<ShareState, { kind: "uploading" }> }) {
  const percent = Math.round(state.progress);
  return (
    <>
      <span className={status} aria-live="polite" aria-atomic="true">
        {state.stage === "compressing"
          ? "Compressing"
          : state.progress >= 100
            ? "Finishing"
            : "Uploading"}
      </span>
      <span
        className="font-game-num text-[12px] text-game-ink-300 tabular-nums"
        aria-label={`${percent} percent done`}
      >
        {percent}%
      </span>
      {/* The row's hairline is the track: it fills left to right in brass. */}
      <span
        aria-hidden
        className={cx("absolute -top-px left-0 h-px w-full bg-game-accent-300", styles.track)}
        style={{ transform: `scaleX(${Math.max(0.02, state.progress / 100)})` }}
      />
    </>
  );
}

function Shared({ saveId, origin }: { saveId: string; origin: "session" | "permalink" }) {
  const path = `/eu5/saves/${saveId}`;
  // The row only renders in the game UI, which is always on the client.
  const url = new URL(path, window.location.origin).toString();
  const { copied, copy } = useCopyLink(path);

  const copyLabel = copied ? (
    <>
      <CheckIcon className="h-3.5 w-3.5" /> Copied
    </>
  ) : (
    "Copy link"
  );

  // On the permalink page the visitor is already on the link and did not
  // share the save, so the row offers a quiet copy and no commit. The
  // visitor does not have the file, so the row also offers it.
  if (origin === "permalink") {
    return (
      <>
        <GameButton variant="ghost" className="px-2" onClick={copy} aria-live="polite">
          {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </GameButton>
        <DownloadSave saveId={saveId} />
      </>
    );
  }

  return (
    <>
      <Link
        to={path}
        target="_blank"
        variant="ghost"
        title={url}
        className={cx(entityLinkControl, "min-w-0 flex-1 truncate font-game-ui text-[12px]")}
      >
        <EntityName>Open permalink</EntityName>
      </Link>
      <GameButton
        variant={copied ? "default" : "commit"}
        className="w-24 shrink-0"
        onClick={copy}
        aria-live="polite"
      >
        {copyLabel}
      </GameButton>
    </>
  );
}

/**
 * Download the shared save. While the file downloads and the original format
 * is restored, the row's hairline is the track, as it is for an upload. The
 * button shows the percent in place of its label.
 */
function DownloadSave({ saveId }: { saveId: string }) {
  const filename = useSaveFilename();
  const download = pdxApi.eu5Saves.useDownload();
  const [progress, setProgress] = useState(0);
  const percent = Math.round(progress);

  const start = () => {
    if (download.isPending) return;
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

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {!download.isPending ? "" : progress < 50 ? "Downloading" : "Preparing the save"}
      </span>
      <GameButton
        variant="ghost"
        className="min-w-[6.5rem] justify-start px-2"
        onClick={start}
        aria-disabled={download.isPending}
        aria-label={download.isPending ? `Downloading, ${percent} percent done` : undefined}
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        {download.isPending ? (
          <span className="font-game-num text-[12px] text-game-ink-100 tabular-nums">
            {percent}%
          </span>
        ) : (
          "Download"
        )}
      </GameButton>
      {download.isPending && (
        <span
          aria-hidden
          className={cx("absolute -top-px left-0 h-px w-full bg-game-accent-300", styles.track)}
          style={{ transform: `scaleX(${Math.max(0.02, progress / 100)})` }}
        />
      )}
    </>
  );
}

/** The status both gated rows share: the beta, and how to get in. */
function ClosedBetaStatus() {
  return (
    <span className={status}>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <span className="cursor-help underline decoration-game-ink-rule decoration-dotted underline-offset-2 hover:decoration-game-ink-100">
            Closed beta
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" className="max-w-64 text-xs">
          EU5 sharing is switched on per Steam account during the beta. Sign in, then ask on Discord
          and an admin enables it.
        </Tooltip.Content>
      </Tooltip>
    </span>
  );
}

function ClosedBeta() {
  return (
    <>
      <ClosedBetaStatus />
      <GameButton variant="default" asChild>
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
          Ask on Discord
        </a>
      </GameButton>
    </>
  );
}

function Guest() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return (
    <>
      <ClosedBetaStatus />
      <GameButton variant="default" asChild>
        <a href={steamLoginHref(returnTo)}>Sign in</a>
      </GameButton>
    </>
  );
}
