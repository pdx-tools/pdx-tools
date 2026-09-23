import { useState } from "react";
import { cx } from "class-variance-authority";
import { CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Link } from "@/components/Link";
import { Tooltip } from "@/components/Tooltip";
import { GameButton } from "@/components/game/Button";
import { EntityName, entityLinkControl } from "../components/EntityName";
import { useSession } from "@/features/account";
import { steamLoginHref } from "@/components/layout/auth/SteamButton";
import { hasFeature } from "@/lib/auth";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "@/lib/toast";
import { pdxApi } from "@/services/appApi";
import {
  useEu5SaveInput,
  useEu5SharedSaveId,
  useSaveFilename,
  useSetEu5SharedSaveId,
} from "../store";
import { footLabel, footRow } from "./footRow";
import styles from "./ShareSave.module.css";

const DISCORD = "https://discord.gg/rCpNWQW";

/**
 * What the share row can be, in the order a player meets them: a guest who
 * must sign in, a player outside the closed beta, a player who can share
 * this file, an upload in flight, and a save that has its permalink.
 */
export type ShareState =
  | { kind: "guest" }
  | { kind: "closed-beta" }
  | { kind: "ready" }
  | { kind: "uploading"; progress: number; stage: "compressing" | "uploading" }
  | { kind: "shared"; saveId: string; origin: "session" | "permalink" };

export function useShareState(): {
  state: ShareState;
  share: () => void;
} {
  const session = useSession();
  const save = useEu5SaveInput();
  const filename = useSaveFilename();
  const sharedSaveId = useEu5SharedSaveId();
  const setSharedSaveId = useSetEu5SharedSaveId();
  const upload = pdxApi.eu5Saves.useAdd();
  const [progress, setProgress] = useState(0);
  // Set only by an upload that finished in this session. A save opened from
  // its permalink is shared too, but the visitor did not share it.
  const [landed, setLanded] = useState(false);

  const share = () => {
    setProgress(0);
    upload.mutate(
      { save, filename, dispatch: setProgress },
      {
        onSuccess: (data) => {
          setLanded(true);
          setSharedSaveId(data.save_id);
        },
        onError: (error) =>
          toast.error("Could not share the save", {
            description: getErrorMessage(error),
            duration: Infinity,
            closeButton: true,
          }),
      },
    );
  };

  let state: ShareState;
  if (sharedSaveId !== null) {
    state = { kind: "shared", saveId: sharedSaveId, origin: landed ? "session" : "permalink" };
  } else if (upload.isPending) {
    state = {
      kind: "uploading",
      progress,
      // The mutation compresses in the first half and uploads in the second.
      stage: progress < 50 ? "compressing" : "uploading",
    };
  } else if (session.id === undefined) {
    state = { kind: "guest" };
  } else if (!hasFeature(session, "eu5-upload")) {
    state = { kind: "closed-beta" };
  } else {
    state = { kind: "ready" };
  }

  return { state, share };
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
  const { state, share } = useShareState();

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
        <Ready onShare={share} />
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
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the link", { description: url, duration: 5000 });
    }
  };

  const copyLabel = copied ? (
    <>
      <CheckIcon className="h-3.5 w-3.5" /> Copied
    </>
  ) : (
    "Copy link"
  );

  // On the permalink page the visitor is already on the link and did not
  // share the save, so the row offers a quiet copy and no commit.
  if (origin === "permalink") {
    return (
      <GameButton variant="ghost" className="px-2" onClick={copy} aria-live="polite">
        {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
        {copied ? "Copied" : "Copy link"}
      </GameButton>
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
        <a href={DISCORD} target="_blank" rel="noreferrer">
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
