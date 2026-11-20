import { useRef, useState } from "react";
import { useFilePublisher } from "@/features/engine";
import type { FileKind } from "@/hooks/useFileDrop";
import { isAbortError } from "@/lib/abortController";

/** The saves that a game adds to its campaign, by file name. */
export type CampaignSaveFiles = {
  pattern: RegExp;
  /** The `accept` list of a file input. */
  accept: string;
  picker: FilePickerAcceptType;
};

/**
 * Pick save files or a folder and add them to the campaign without opening
 * one. The browser picker keeps file handles when it has one.
 */
export function useAddCampaignSaves(files: CampaignSaveFiles, onError: (error: string) => void) {
  const publishFile = useFilePublisher({ openSave: false });
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const addFiles = async (selected: FileKind[]) => {
    const saves = selected.filter((input) => files.pattern.test(input.file.name));
    if (!saves.length) return;
    setBusy(true);
    try {
      await publishFile(saves);
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.currentTarget.files ?? [], (file) => ({ kind: "file", file })));
    event.currentTarget.value = "";
  };
  const chooseFiles = async () => {
    if (!("showOpenFilePicker" in window)) {
      input.current?.click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: [files.picker] });
      await addFiles(handles.map((file) => ({ kind: "handle", file })));
    } catch (error) {
      if (!isAbortError(error)) onError(String(error));
    }
  };
  const chooseFolder = async () => {
    if (!("showDirectoryPicker" in window)) {
      folder.current?.click();
      return;
    }
    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      setBusy(true);
      await addFiles(await folderSaves(directory, files.pattern));
    } catch (error) {
      if (!isAbortError(error)) onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    chooseFiles,
    chooseFolder,
    /** Props of the hidden inputs for browsers without the pickers. */
    fileInput: {
      ref: input,
      type: "file",
      accept: files.accept,
      multiple: true,
      onChange,
    },
    folderInput: {
      ref: folder,
      type: "file",
      multiple: true,
      webkitdirectory: "",
      onChange,
    },
  } as const;
}

/** Keep file handles when selecting a folder, including nested save directories. */
async function folderSaves(
  directory: FileSystemDirectoryHandle,
  pattern: RegExp,
): Promise<FileKind[]> {
  const files: FileKind[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind === "directory") files.push(...(await folderSaves(handle, pattern)));
    else if (pattern.test(handle.name)) files.push({ kind: "handle", file: handle });
  }
  return files;
}
