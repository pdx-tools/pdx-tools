import { create } from "zustand";
import { downloadData } from "@/lib/downloadData";
import { toast } from "@/lib/toast";
import { keptFile } from "./bytes";
import { COPY_MISSING } from "./text";
import type { KeptSave } from "./types";

export type UploadState =
  | { kind: "uploading"; progress: number }
  | { kind: "duplicate" }
  | { kind: "failed"; message: string };

/** The dialogs of the kept saves, which any view can open. */
export const useKeptUi = create<{
  watchOpen: boolean;
  upload: KeptSave | null;
  remove: readonly KeptSave[] | null;
  uploads: Readonly<Record<string, UploadState>>;
}>()(() => ({ watchOpen: false, upload: null, remove: null, uploads: {} }));

export const setWatchOpen = (watchOpen: boolean) => useKeptUi.setState({ watchOpen });

/** The control that opened a dialog, for the focus when the dialog closes. */
let opener: Element | null = null;
let fallback: Element | null = null;

/** Note the control before its menu closes or its dialog opens. */
export function noteOpener(element: Element | null = document.activeElement) {
  opener = element;
  // A dialog closes the popover that its opener is in.
  const popover = element?.closest("[role=dialog]");
  fallback = popover ? document.querySelector(`[aria-controls="${CSS.escape(popover.id)}"]`) : null;
}

/** Give the focus back to the control that opened the dialog. */
export function returnFocus(event: Event) {
  event.preventDefault();
  const element = fallback ?? opener;
  if (element instanceof HTMLElement && element.isConnected) element.focus();
}

export const requestDelete = (remove: readonly KeptSave[]) => useKeptUi.setState({ remove });

let isUploading = false;

/** One save uploads at a time. Call the result when the upload ends. */
export function beginUpload(): (() => void) | null {
  if (isUploading) {
    toast.error("Another save is uploading.");
    return null;
  }
  isUploading = true;
  return () => {
    isUploading = false;
  };
}

/** Return whether the dialog opens. */
export function requestUpload(upload: KeptSave): boolean {
  if (isUploading) toast.error("Another save is uploading.");
  else useKeptUi.setState({ upload });
  return !isUploading;
}

export function setUpload(hash: string, state: UploadState | null) {
  useKeptUi.setState(({ uploads }) => {
    const next = { ...uploads };
    if (state === null) delete next[hash];
    else next[hash] = state;
    return { uploads: next };
  });
}

export async function downloadKept(save: KeptSave): Promise<void> {
  const file = await keptFile(save.hash);
  if (file === null) toast.error(COPY_MISSING);
  else downloadData(file, save.name);
}
