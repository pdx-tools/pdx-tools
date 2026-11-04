import { createContext, useContext, useRef } from "react";
import { cx } from "class-variance-authority";
import ArrowDownTrayIcon from "@heroicons/react/24/outline/ArrowDownTrayIcon";
import ArrowTopRightOnSquareIcon from "@heroicons/react/24/outline/ArrowTopRightOnSquareIcon";
import ArrowUpTrayIcon from "@heroicons/react/24/outline/ArrowUpTrayIcon";
import DocumentPlusIcon from "@heroicons/react/24/outline/DocumentPlusIcon";
import FolderPlusIcon from "@heroicons/react/24/outline/FolderPlusIcon";
import FireIcon from "@heroicons/react/24/outline/FireIcon";
import FolderOpenIcon from "@heroicons/react/24/outline/FolderOpenIcon";
import MapIcon from "@heroicons/react/24/outline/MapIcon";
import EllipsisHorizontalIcon from "@heroicons/react/24/outline/EllipsisHorizontalIcon";
import QuestionMarkCircleIcon from "@heroicons/react/24/outline/QuestionMarkCircleIcon";
import { focusRing } from "@/components/game/focusRing";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useFilePublisher } from "@/features/engine";
import type { FileKind } from "@/hooks/useFileDrop";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { isAbortError } from "@/lib/abortController";
import { downloadData } from "@/lib/downloadData";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { DISCORD_INVITE_URL } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { GameMenu, GameMenuHint } from "../components";
import { useMapHistory } from "../history/context";
import { useEu5Engine, useEu5OwnerBorders, useSaveFilename } from "../store";
import { CampaignNotices, useCampaignSaves } from "./AddCampaignSaves";
import type { CampaignSaves } from "./AddCampaignSaves";
import {
  ShareButton,
  closedBetaHint,
  isShareAction,
  signInHref,
  useDownloadSave,
  useShareState,
} from "./ShareSave";
import type { DownloadState, ShareState } from "./ShareSave";

/** The files that open in PDX Tools, as the home page accepts them */
const SAVE_FILES: `.${string}`[] = [".eu4", ".eu5", ".ck3", ".hoi4", ".rome", ".v3"];

type SaveActions = {
  share: ShareState;
  download: DownloadState;
  melt: { isLoading: boolean; run: () => void };
  campaign: CampaignSaves | null;
  openSave: () => void;
  /** While the next save of a campaign loads, the actions on the save wait. */
  unavailable: boolean;
};

const SaveActionsContext = createContext<SaveActions | null>(null);

function useSaveActions() {
  const actions = useContext(SaveActionsContext);
  if (actions === null) throw new Error("The save actions need a SaveActionsProvider");
  return actions;
}

/**
 * The actions on the open save. The ⋯ menu closes when an action starts,
 * and the save line and the phone row each show the actions, so the state
 * of each action lives here, above them: the upload, the download, the
 * melt, and the hidden file inputs.
 */
export function SaveActionsProvider({ children }: { children: React.ReactNode }) {
  const unavailable = !!useMapHistory()?.preview;
  const share = useShareState();
  const download = useDownloadSave(
    share.kind === "shared" && share.origin === "permalink" ? share.saveId : null,
  );
  const melt = useMelt();
  const campaign = useCampaignSaves();
  const [openSave, openInput] = useOpenSave();

  return (
    <SaveActionsContext.Provider value={{ share, download, melt, campaign, openSave, unavailable }}>
      {children}
      {campaign?.inputs}
      {openInput}
    </SaveActionsContext.Provider>
  );
}

function useMelt() {
  const engine = useEu5Engine();
  const saveFilename = useSaveFilename();
  const { isLoading, run } = useTriggeredAction({
    action: async () => {
      try {
        const meltedData = await engine.queries.melt();
        const baseName = saveFilename.substring(0, saveFilename.lastIndexOf(".")) || saveFilename;
        downloadData(meltedData, `${baseName}_melted.eu5`);
        toast.success("Save file melted and downloaded", { duration: 2000 });
      } catch (error) {
        toast.error("Melt error", { description: getErrorMessage(error), duration: 3000 });
      }
    },
  });
  return { isLoading, run: () => void run() };
}

/** Open a save in place of this one, as a drop on the page does */
function useOpenSave() {
  const publishFile = useFilePublisher();
  const input = useRef<HTMLInputElement>(null);
  const open = (files: FileKind[]) =>
    void publishFile(files).catch((error) =>
      toast.error("Could not open the save", {
        description: getErrorMessage(error),
        duration: 3000,
      }),
    );

  const choose = async () => {
    if (!("showOpenFilePicker" in window)) {
      input.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Saves", accept: { "application/pdx": SAVE_FILES } }],
      });
      open([{ kind: "handle", file: handle }]);
    } catch (error) {
      if (!isAbortError(error)) toast.error("Could not open the save");
    }
  };

  const element = (
    <input
      ref={input}
      type="file"
      aria-label="Open another save"
      className="sr-only"
      tabIndex={-1}
      accept={SAVE_FILES.join(",")}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) open([{ kind: "file", file }]);
        event.currentTarget.value = "";
      }}
    />
  );
  return [() => void choose(), element] as const;
}

/** The share button, when this player can share. Its label carries the state of the share. */
export function SaveShareButton() {
  const { share, unavailable } = useSaveActions();
  return isShareAction(share) ? <ShareButton share={share} unavailable={unavailable} /> : null;
}

/** The notices of the campaign import under the campaign, when they apply */
export function CampaignStatus() {
  const { campaign } = useSaveActions();
  return campaign ? <CampaignNotices busy={campaign.busy} /> : null;
}

/**
 * The ⋯ menu of the save. The actions on the save file come first, then
 * the navigation. Share is here when the player cannot share yet. On a
 * phone, the menu also holds help and owner borders, and it gives the save's
 * name when the top row of the sheet cuts it. While a download or an import of saves runs,
 * the ⋯ is a spinner.
 */
export function SaveOverflowMenu({
  className,
  save,
  ownerBorders = false,
  onHelp,
}: {
  className?: string;
  /** The save name and date at the top of the menu, when the phone row cuts the name */
  save?: React.ReactNode;
  /** The owner borders item, for the phone, which has the toggle in this menu */
  ownerBorders?: boolean;
  /** The help item, for the phone row */
  onHelp?: () => void;
}) {
  const { share, download, melt, unavailable, campaign, openSave } = useSaveActions();
  const engine = useEu5Engine();
  const bordersOn = useEu5OwnerBorders();
  const helpChosen = useRef(false);
  const wide = useBreakpoint("md");
  // The divider comes after the actions on the save file, when there are some.
  const fileItems =
    share.kind === "guest" ||
    share.kind === "closed-beta" ||
    (share.kind === "shared" && share.origin === "permalink") ||
    campaign !== null;
  const busy = download.pending || melt.isLoading || !!campaign?.busy;

  return (
    <GameMenu>
      <GameMenu.Trigger
        aria-label="More actions"
        aria-busy={busy || undefined}
        title={download.pending ? `Downloading the save, ${download.progress}%` : "More actions"}
        className={cx(
          "grid h-7 w-7 shrink-0 place-items-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 data-[state=open]:bg-game-panel-hover data-[state=open]:text-game-ink-100",
          focusRing,
          className,
        )}
      >
        {busy ? (
          <LoadingIcon aria-hidden className="h-4 w-4" />
        ) : (
          <EllipsisHorizontalIcon aria-hidden className="h-4 w-4" />
        )}
      </GameMenu.Trigger>
      <GameMenu.Content
        // Beside its trigger, over the map, so that it does not cut through the labels of
        // the column. A phone has no room there, so the menu is under its trigger at the edge.
        side={wide ? "right" : "bottom"}
        align={wide ? "start" : "end"}
        collisionPadding={8}
        className="w-64"
        onCloseAutoFocus={(event) => {
          // Help opens when the menu has closed, so the focus that comes
          // back to ⋯ does not close the help again.
          if (!helpChosen.current) return;
          helpChosen.current = false;
          event.preventDefault();
          onHelp?.();
        }}
      >
        {save ? (
          <>
            <div className="px-2.5 py-1.5">{save}</div>
            <GameMenu.Separator />
          </>
        ) : null}
        <GameMenu.Item disabled={unavailable || melt.isLoading} onSelect={melt.run}>
          <FireIcon aria-hidden />
          Melt save
          <GameMenuHint>plaintext</GameMenuHint>
        </GameMenu.Item>
        <ShareItem share={share} />
        {share.kind === "shared" && share.origin === "permalink" ? (
          // The visitor is on the link but does not have the file.
          <GameMenu.Item disabled={download.pending} onSelect={download.start}>
            <ArrowDownTrayIcon aria-hidden />
            Download save
            {download.pending ? <GameMenuHint>{download.progress}%</GameMenuHint> : null}
          </GameMenu.Item>
        ) : null}
        {campaign ? (
          <>
            <GameMenu.Item disabled={campaign.busy} onSelect={() => void campaign.chooseFiles()}>
              <DocumentPlusIcon aria-hidden />
              Add campaign saves
            </GameMenu.Item>
            <GameMenu.Item disabled={campaign.busy} onSelect={() => void campaign.chooseFolder()}>
              <FolderPlusIcon aria-hidden />
              Add save folder
            </GameMenu.Item>
          </>
        ) : null}
        {fileItems ? <GameMenu.Separator /> : null}
        {share.kind === "shared" && share.origin === "session" ? (
          <GameMenu.Item asChild>
            <a href={`/eu5/saves/${share.saveId}`} target="_blank" rel="noreferrer">
              <ArrowTopRightOnSquareIcon aria-hidden />
              Open permalink
            </a>
          </GameMenu.Item>
        ) : null}
        <GameMenu.Item onSelect={openSave}>
          <FolderOpenIcon aria-hidden />
          Open another save
        </GameMenu.Item>
        {ownerBorders ? (
          <GameMenu.Item
            role="menuitemcheckbox"
            aria-checked={bordersOn}
            onSelect={() => void engine.trigger.toggleOwnerBorders()}
          >
            <MapIcon aria-hidden />
            Owner borders
            <GameMenuHint>{bordersOn ? "On" : "Off"}</GameMenuHint>
          </GameMenu.Item>
        ) : null}
        {onHelp ? (
          <GameMenu.Item onSelect={() => (helpChosen.current = true)}>
            <QuestionMarkCircleIcon aria-hidden />
            Shortcuts
            <GameMenuHint>?</GameMenuHint>
          </GameMenu.Item>
        ) : null}
      </GameMenu.Content>
    </GameMenu>
  );
}

/**
 * Share in the ⋯ menu, for a player who cannot share yet. Each state leads
 * somewhere: a guest signs in, and a player outside the closed beta asks on
 * Discord.
 */
function ShareItem({ share }: { share: ShareState }) {
  switch (share.kind) {
    case "guest":
      return (
        <GameMenu.Item asChild>
          <a href={signInHref()} title="Sign in with Steam to share">
            <ArrowUpTrayIcon aria-hidden />
            Sign in to share
          </a>
        </GameMenu.Item>
      );
    case "closed-beta":
      return (
        <GameMenu.Item asChild>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" title={closedBetaHint}>
            <ArrowUpTrayIcon aria-hidden />
            Share
            <GameMenuHint>closed beta</GameMenuHint>
          </a>
        </GameMenu.Item>
      );
    default:
      return null;
  }
}
