import FolderOpenIcon from "@heroicons/react/24/outline/FolderOpenIcon";
import { GameButton } from "@/components/game";
import { sectionLabel } from "@/components/game/SectionTitle";
import { ToggleGroup } from "@/components/ToggleGroup";
import { Link } from "@/components/Link";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { OpenSave } from "@/features/campaign/types";
import { formatLongDate } from "@/features/timeline/date";
import { lastSize, latestOf, nextLimit, roomFor, sizeOf, useKept } from "./keptStore";
import { StartWatchForm, Option } from "./StartWatchForm";
import type { WatchStatus } from "./status";
import { supportsKeptSaves } from "./support";
import {
  formatBytes,
  formatWhen,
  rejectedText,
  resumedText,
  roomText,
  savesText,
  UNSUPPORTED,
  UNSUPPORTED_HELP,
} from "./text";
import type { UpdateMap, WatchConfig } from "./types";
import { setWatchOpen } from "./ui";
import { useOpenKept } from "./useOpenKept";
import { useWatchStart } from "./useWatchStart";
import type { WatchStarter } from "./useWatchStart";
import type { WatchView } from "./useWatchFollow";
import {
  act,
  changeLimit,
  forgetWatch,
  resumeWatch,
  retryMissed,
  setKeep,
  setUpdateMap,
  stopWatch,
  takeWatch,
} from "./watchService";

const UPDATE_MAP: readonly (readonly [UpdateMap, string])[] = [
  ["EverySave", "Any Modification"],
  ["Daily", "Daily"],
  ["Monthly", "Monthly"],
  ["Yearly", "Yearly"],
];

export function WatchPopover({ view, status }: { view: WatchView; status: WatchStatus }) {
  const config = useKept((state) => state.watches[view.open.game]);
  if (!supportsKeptSaves()) {
    return (
      <Section title="Watch save">
        <p className="text-game-ink-100">{UNSUPPORTED}</p>
        <p>{UNSUPPORTED_HELP}</p>
      </Section>
    );
  }
  return config === undefined ? (
    <StartWatch open={view.open} />
  ) : (
    <WatchDetails view={view} status={status} config={config} />
  );
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-game-line p-3 last:border-b-0">
      {title && <h2 className={`mb-1.5 break-words ${sectionLabel}`}>{title}</h2>}
      {children}
    </section>
  );
}

/** The game file of the open save. A dropped or kept save has none. */
function gameHandle(open: OpenSave): FileSystemFileHandle | undefined {
  if (open.source.kind !== "local" || open.source.ref.kind !== "handle") return undefined;
  const entry = localSaveRegistry.get(open.source.entryId ?? "");
  return entry?.kept ? undefined : open.source.ref.file;
}

function StartForm({ starter, open }: { starter: WatchStarter; open: OpenSave }) {
  const { choice } = starter;
  if (choice === null) return null;
  return (
    <Section title={`Watch “${choice.handle.name}”`}>
      <StartWatchForm
        starter={starter}
        choice={choice}
        surface="game"
        openName={choice.saves.handles.has(open.name) ? open.name : null}
        onChooseAgain={() => void starter.chooseFolder(open.game, gameHandle(open))}
        onDone={() => setWatchOpen(false)}
      />
    </Section>
  );
}

function StartWatch({ open }: { open: OpenSave }) {
  const starter = useWatchStart();
  const { choice, error } = starter;
  const handle = gameHandle(open);
  const chooseFolder = () => void starter.chooseFolder(open.game, handle);
  if (choice !== null) return <StartForm starter={starter} open={open} />;
  return (
    <>
      <Section title="Watch save">
        <p className="text-game-ink-100">
          PDX Tools sees each save the game writes, while a PDX Tools tab is open.
        </p>
        <p>
          It can keep copies, so you can open a save after the game writes over it. Choose that in
          the next step.
        </p>
      </Section>
      <Section>
        <GameButton variant="commit" className="w-full" onClick={chooseFolder}>
          <FolderOpenIcon aria-hidden className="size-4" />
          Choose the save folder
        </GameButton>
        <p className="mt-2 break-words">
          {handle && `Opens at the folder of ${open.name}. `}Includes autosaves and manual saves.
        </p>
        {handle && (
          <GameButton
            className="mt-2 h-auto! min-h-7 w-full break-all"
            onClick={() => void starter.chooseFile(open.game, handle)}
          >
            Only {open.name}
          </GameButton>
        )}
        {error && <p className="mt-2 text-game-warn">{error}</p>}
      </Section>
    </>
  );
}

function WatchDetails({
  view,
  status,
  config,
}: {
  view: WatchView;
  status: WatchStatus;
  config: WatchConfig;
}) {
  const { game } = view.open;
  const isRunning = useKept(({ live }) => live[game].phase !== "off");
  const isWatching = useKept(({ live }) => live[game].phase === "watching");
  const starter = useWatchStart();
  if (starter.choice !== null) return <StartForm starter={starter} open={view.open} />;
  const isFull = status.kind === "limit" || status.kind === "disk";
  return (
    <>
      <Section title={`${isWatching ? "Watching" : "Watch"} “${config.handle.name}”`}>
        <Problem
          game={game}
          status={status}
          view={view}
          onChoose={() => void starter.chooseFolder(game)}
        />
        <LastSave view={view} />
      </Section>
      {view.other !== null && <OtherCampaign write={view.other} />}
      <Section>
        <KeepOption config={config} open={view.open} isFull={isFull} />
      </Section>
      <Section>
        <h3 className="mb-1.5 text-game-ink-100">Update the map</h3>
        <ToggleGroup
          type="single"
          value={config.updateMap}
          onValueChange={(value) => value && act(setUpdateMap(game, value as UpdateMap))}
          aria-label="Update the map"
          className="mb-2 inline-flex flex-wrap rounded-control border border-game-line-strong"
        >
          {UPDATE_MAP.map(([value, label]) => (
            <ToggleGroup.Item
              key={value}
              value={value}
              className="rounded-control! font-normal! text-game-ink-100! data-[state=on]:bg-game-panel-active! data-[state=on]:text-game-ink-100!"
            >
              {label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup>
        {view.skipped && view.latest && (
          <p className="mb-2 text-game-ink-100">
            {formatLongDate(view.latest.save.date)} is {view.latest.save.kept ? "kept" : "seen"}.
            The map updates {config.updateMap.toLowerCase()}.
          </p>
        )}
        <p>
          {game === "eu5" &&
            "Each update loads the whole save again; the old map stays until it is ready, and does not respond. "}
          {config.keep && !isFull && "Every different save is kept, whichever you choose. "}
          On an older save, the map stays until you choose Latest.
        </p>
        <p className="mt-2">
          Watching works while this tab is open. The browser can delay a background tab.
        </p>
      </Section>
      <Section>
        <div className="flex items-center justify-between gap-2">
          <KeptSavesLink />
          {isRunning && status.kind !== "elsewhere" ? (
            <GameButton variant="ghost" onClick={() => act(stopWatch(game))}>
              Stop watching
            </GameButton>
          ) : (
            <GameButton variant="ghost" onClick={() => act(forgetWatch(game))}>
              Forget folder
            </GameButton>
          )}
        </div>
      </Section>
    </>
  );
}

/** Leaving the page closes the open save, so the list is in another tab. */
export function KeptSavesLink() {
  return (
    <Link
      to="/saves/kept"
      target="_blank"
      variant="ghost"
      className="text-xs text-game-ink-100 underline underline-offset-2"
    >
      Kept saves (new tab)
    </Link>
  );
}

function Problem({
  game,
  status,
  view,
  onChoose,
}: {
  game: OpenSave["game"];
  status: WatchStatus;
  view: WatchView;
  onChoose: () => void;
}) {
  const state = useKept();
  const config = state.watches[game]!;
  const { name } = config.handle;
  const text = (children: string) => <p className="text-game-warn">{children}</p>;
  const action = (label: string, onClick: () => void) => (
    <GameButton variant="commit" className="my-2" onClick={onClick}>
      {label}
    </GameButton>
  );
  switch (status.kind) {
    case "no-access":
      return (
        <>
          {text(`The browser no longer allows “${name}”. Nothing is being kept.`)}
          {action("Allow access", () => act(resumeWatch(game)))}
        </>
      );
    case "not-found":
      return (
        <>
          {text(
            `“${name}” was not found. It was moved, renamed or deleted. Kept saves are not affected.`,
          )}
          {action("Choose the save folder", onChoose)}
        </>
      );
    case "limit": {
      const next = nextLimit(state);
      return (
        <>
          {text(
            `The ${formatBytes(state.settings.limit)} limit is reached. New saves are not kept.`,
          )}
          <p>
            Raise the limit or delete kept saves; saves still in the folder are then kept. Watching
            goes on.
          </p>
          {next !== undefined &&
            action(`Raise the limit to ${formatBytes(next)}`, () => act(changeLimit(next)))}
        </>
      );
    }
    case "disk":
      return (
        <>
          {text("The disk is full. New saves are not kept.")}
          <p>They are kept when there is room, if the files are still there. Watching goes on.</p>
          {action("Try again", retryMissed)}
        </>
      );
    case "failed":
      return (
        <>
          {text(`${status.text}. The old save stays.`)}
          {action("Try again", view.openLatest)}
        </>
      );
    case "elsewhere":
      return (
        <>
          <p className="text-game-ink-100">
            Watching in another tab. New saves show here. If that tab closes, this one takes over.
          </p>
          {action("Watch in this tab", () => takeWatch(game))}
        </>
      );
    case "paused":
      return (
        <>
          <p className="text-game-ink-100">
            Watching is paused.
            {config.lastWatchedAt !== null && ` Last watched ${formatWhen(config.lastWatchedAt)}.`}
          </p>
          {action("Resume watching", () => act(resumeWatch(game)))}
        </>
      );
    default:
      return null;
  }
}

function LastSave({ view }: { view: WatchView }) {
  const { game } = view.open;
  const { writing, rejected, resumed } = useKept((state) => state.live[game]);
  const index = useKept((state) => state.index);
  const last = latestOf(index, game);
  const keep = useKept((state) => state.watches[game]?.keep);
  return (
    <div className="flex flex-col gap-1">
      {last?.date && (
        <div>
          <p className="text-game-ink-100">
            {index.saves.has(last.hash) ? "Kept" : "Seen"} {formatLongDate(last.date)}
            {last.countryName && `, ${last.countryName}`}
          </p>
          <p className="break-words">
            {last.name}, written {formatWhen(last.writtenAt)}.
          </p>
        </div>
      )}
      {!last && <p>No save was written since the watch started.</p>}
      {writing && (
        <p className="break-words">
          The game is writing {writing}.{keep && " It is kept when it is complete."}
        </p>
      )}
      {rejected && <p className="break-words text-game-warn">{rejectedText(rejected).join(" ")}</p>}
      {resumed && <p>{resumedText(resumed)}</p>}
    </div>
  );
}

function OtherCampaign({ write }: { write: NonNullable<WatchView["other"]> }) {
  const openKept = useOpenKept();
  const save = useKept(({ index }) => index.saves.get(write.hash));
  const country = write.countryName ?? "another campaign";
  const open = () => {
    if (save === undefined) return;
    setWatchOpen(false);
    act(openKept(save, { replace: true }));
  };
  return (
    <Section>
      <p className="text-game-ink-100">
        New save of {country}
        {write.date && `, ${formatLongDate(write.date)}`}.
      </p>
      <GameButton className="mt-2 h-auto! min-h-7" onClick={open}>
        Open {write.countryName ?? "that"} save
      </GameButton>
    </Section>
  );
}

function KeepOption({
  config,
  open,
  isFull,
}: {
  config: WatchConfig;
  open: OpenSave;
  isFull: boolean;
}) {
  const state = useKept();
  const saves = state.saves?.filter((save) => save.game === config.game) ?? [];
  const room = roomFor(state, lastSize(state.saves, config.game));
  const { source } = open;
  const isUnkept =
    config.keep && !isFull && source.kind === "local" && !state.index.saves.has(source.hash ?? "");
  const used =
    saves.length > 0
      ? `${savesText(saves.length, "kept")}, ${formatBytes(sizeOf(saves))}.`
      : "Open a save after the game writes over it. Copies stay in this browser and are not uploaded.";
  return (
    <Option
      surface="game"
      label="Keep a copy of each new save"
      checked={config.keep}
      onChange={(keep) => act(setKeep(config.game, keep))}
    >
      {used}
      {room !== null && !isFull && ` Room for ${roomText(room, "more")}.`}
      {isUnkept && " The save on screen is not kept until the game writes again."}
    </Option>
  );
}
