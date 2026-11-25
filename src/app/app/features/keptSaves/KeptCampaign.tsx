import { useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { GameMark } from "@/features/saves/saveDetails";
import { formatInt } from "@/lib/format";
import { KeptFlag } from "./KeptFlag";
import { KeptSaveMenu } from "./KeptSaveMenu";
import type { KeptGroup } from "./groupKept";
import { sizeOf, useKept } from "./keptStore";
import {
  COPY_MISSING,
  formatBytes,
  formatPageDate,
  formatWhen,
  pageFileText,
  savesText,
} from "./text";
import type { KeptSave } from "./types";
import { UploadStatus } from "./UploadStatus";
import { useKeptFile } from "./useKeptFile";
import { useOpenKept } from "./useOpenKept";
import { act, deleteKeptSaves, identifyAgain } from "./watchService";

const FIRST_ROWS = 10;

const checkbox = "size-4 shrink-0 accent-sky-700";

export function KeptCampaign({
  group,
  selected,
  onSelect,
}: {
  group: KeptGroup;
  selected: ReadonlySet<string>;
  /** A range adds the saves from the last clicked row. */
  onSelect: (hashes: readonly string[], checked: boolean) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const lastClicked = useRef<number | null>(null);
  const { saves } = group;
  const rows = showAll ? saves : saves.slice(0, FIRST_ROWS);
  const count = saves.filter((save) => selected.has(save.hash)).length;
  const hashes = saves.map((save) => save.hash);

  return (
    <section aria-label={group.name}>
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-300 pb-2 dark:border-gray-600">
        <input
          type="checkbox"
          aria-label={`Select every save of ${group.name}`}
          className={checkbox}
          checked={count === saves.length}
          ref={(input) => {
            if (input) input.indeterminate = count > 0 && count < saves.length;
          }}
          onChange={(event) => onSelect(hashes, event.currentTarget.checked)}
        />
        {group.isKnown && <KeptFlag save={saves.find((x) => x.flag !== null) ?? saves[0]} />}
        <h2 className="min-w-0 text-lg font-bold break-words">{group.name}</h2>
        <GameMark game={group.game} />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {savesText(saves.length)}, {formatBytes(sizeOf(saves))}
        </span>
      </header>
      <ul>
        {rows.map((save, i) => (
          <KeptRow
            key={save.hash}
            save={save}
            selected={selected.has(save.hash)}
            onSelect={(checked, isRange) => {
              const from = isRange && lastClicked.current !== null ? lastClicked.current : i;
              lastClicked.current = i;
              onSelect(hashes.slice(Math.min(from, i), Math.max(from, i) + 1), checked);
            }}
          />
        ))}
      </ul>
      {rows.length < saves.length && (
        <button
          type="button"
          className="cursor-pointer py-2.5 pl-7 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
          onClick={() => setShowAll(true)}
        >
          Show all {formatInt(saves.length)} saves{group.isKnown && ` of ${group.name}`}
        </button>
      )}
    </section>
  );
}

function KeptRow({
  save,
  selected,
  onSelect,
}: {
  save: KeptSave;
  selected: boolean;
  onSelect: (checked: boolean, isRange: boolean) => void;
}) {
  const file = useKeptFile(save.hash);
  const open = useOpenKept();
  const missing = useKept((state) => state.missing.has(save.hash));
  const wentBack = useKept(({ index }) => index.wentBack.has(save.hash));
  const date = formatPageDate(save.date);
  return (
    <li
      className={cx(
        "border-b border-gray-300 text-sm dark:border-gray-600",
        selected && "bg-sky-50 dark:bg-sky-950",
      )}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-2 md:grid-cols-[auto_8.5rem_1fr_8rem_10rem_4.5rem_auto_auto]">
        <input
          type="checkbox"
          aria-label={`Select ${date}, ${save.name}`}
          className={checkbox}
          checked={selected}
          onChange={(event) =>
            onSelect(
              event.currentTarget.checked,
              event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey,
            )
          }
        />
        <span className="font-medium">{date}</span>
        <span className="col-start-2 min-w-0 [overflow-wrap:anywhere] break-words md:col-auto">
          {save.name}
        </span>
        <span className="col-start-2 text-gray-600 md:col-auto dark:text-gray-300">
          Kept {formatWhen(save.keptAt)}
        </span>
        <div className="col-start-2 text-gray-600 md:col-auto dark:text-gray-300">
          {file && pageFileText[file]}
          <UploadStatus save={save} />
        </div>
        <span className="col-start-2 text-gray-600 tabular-nums md:col-auto md:text-right dark:text-gray-300">
          {formatBytes(save.size)}
        </span>
        <Button
          className="col-start-3 row-span-2 row-start-1 py-1.5 text-sm md:col-auto md:row-auto"
          disabled={missing}
          onClick={() => act(open(save))}
        >
          Open save
        </Button>
        <KeptSaveMenu save={save} surface="page" className="col-start-3 md:col-auto" />
      </div>
      {wentBack && (
        <p className="pb-2 pl-7 text-gray-600 dark:text-gray-300">
          The game went back to an earlier date. The saves below stay.
        </p>
      )}
      {missing && (
        <p className="pb-2 pl-7">
          {[date, save.countryName].filter(Boolean).join(", ")}. {COPY_MISSING}{" "}
          <TextButton onClick={() => act(deleteKeptSaves([save.hash]))}>
            Remove from list
          </TextButton>
        </p>
      )}
      {save.identity === "failed" && !missing && (
        <p className="pb-2 pl-7 text-gray-600 dark:text-gray-300">
          This save is kept, but its campaign could not be read. Open save tries again.{" "}
          <TextButton onClick={() => act(identifyAgain(save.hash))}>Try again now</TextButton>
        </p>
      )}
    </li>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="cursor-pointer font-semibold text-sky-700 hover:underline dark:text-sky-400"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
