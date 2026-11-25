import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { captureException } from "@/lib/captureException";
import { toast } from "@/lib/toast";
import { sizeOf, useKept } from "./keptStore";
import { fileState, formatBytes, formatPageDate, savesText } from "./text";
import type { KeptSave } from "./types";
import { returnFocus, useKeptUi } from "./ui";
import { deleteKeptSaves, openKept } from "./watchService";

/** More saves than this get a summary. */
const MAX_SENTENCES = 5;

export function DeleteKeptDialog({ saves }: { saves: readonly KeptSave[] }) {
  const state = useKept();
  // Null until it is known which saves are open.
  const [open, setOpen] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    openKept().then(setOpen, (error) => {
      captureException(error);
      // A save that is open is refused again at the delete.
      setOpen(new Set());
    });
  }, []);
  const close = () => useKeptUi.setState({ remove: null });
  if (open === null) return null;

  const removed = saves.filter((save) => !open.has(save.hash));
  const left = saves.length - removed.length;
  const inFolder = (save: KeptSave) => {
    const file = fileState(save, state);
    return file === "in-folder" || file === "last-seen";
  };
  const only = removed.filter((save) => !inFolder(save));
  const others = removed.length - only.length;
  const countries = new Set(removed.map((save) => save.countryName));
  const country = countries.size === 1 ? [...countries][0] : null;
  const count = savesText(removed.length, "kept");
  const years = removed.flatMap((save) => save.date?.year ?? []);
  const action = removed.length === 1 ? "Delete save" : `Delete ${savesText(removed.length)}`;

  return (
    <Dialog open onOpenChange={close}>
      <Dialog.Content onCloseAutoFocus={returnFocus} className="max-h-[90vh] overflow-y-auto">
        <Dialog.Title>
          Delete {count}
          {country && ` of ${country}`}?
        </Dialog.Title>
        <Dialog.Description asChild>
          <div className="flex flex-col gap-3 text-black! dark:text-white!">
            {removed.length <= MAX_SENTENCES ? (
              removed.map((save) => (
                <p key={save.hash} className="break-words">
                  {formatPageDate(save.date)}, {save.name}:{" "}
                  {inFolder(save)
                    ? "last seen in the save folder. The file there is not changed."
                    : "the file was written over, or is not known to be in the folder. This may be the only copy. It cannot be recovered."}
                </p>
              ))
            ) : (
              <>
                {only.length > 0 && (
                  <p>
                    {savesText(only.length)} {only.length === 1 ? "is" : "are"} written over by the
                    game or not known to be in the folder. These may be the only copies, and they
                    cannot be recovered.
                  </p>
                )}
                {others > 0 && (
                  <p>
                    {savesText(others)} {others === 1 ? "was" : "were"} last seen in the save
                    folder. The files there are not changed.
                  </p>
                )}
              </>
            )}
            {left > 0 && (
              <p>
                {left === 1
                  ? "1 open save is left out."
                  : `${savesText(left, "open")} are left out.`}
              </p>
            )}
            <p className="text-gray-600 dark:text-gray-300">
              {years.length > 1 && `${Math.min(...years)} to ${Math.max(...years)}. `}Frees{" "}
              {formatBytes(sizeOf(removed))}.
            </p>
          </div>
        </Dialog.Description>
        <Dialog.Footer>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            disabled={removed.length === 0}
            onClick={() => {
              close();
              deleteKeptSaves(removed.map((save) => save.hash)).catch((error) => {
                captureException(error);
                toast.error("Could not delete every save");
              });
            }}
          >
            {action}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
