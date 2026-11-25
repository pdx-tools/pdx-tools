import type { CampaignGame } from "@/features/campaign/types";
import { isDomException } from "./bytes";
import type { Listing } from "./folder";
import type { FileStat } from "./types";

const savePattern = (game: CampaignGame) => (game === "eu4" ? /\.eu4$/i : /\.eu5$/i);

export const fileStat = (file: File): FileStat => ({ size: file.size, mtime: file.lastModified });

export type SaveFiles = { listing: Listing; handles: Map<string, FileSystemFileHandle> };

/** List the saves of a game in a folder and its subfolders, or the one watched file. */
export async function listSaves(
  root: FileSystemDirectoryHandle | FileSystemFileHandle,
  game: CampaignGame,
): Promise<SaveFiles> {
  const listing = new Map<string, FileStat>();
  const handles = new Map<string, FileSystemFileHandle>();
  const pattern = savePattern(game);

  const addFile = async (handle: FileSystemFileHandle, path: string) => {
    const file = await handle.getFile();
    if (file.size === 0) return;
    listing.set(path, fileStat(file));
    handles.set(path, handle);
  };
  const addDirectory = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    for await (const handle of directory.values()) {
      const path = prefix + handle.name;
      if (handle.kind === "directory") {
        await addDirectory(handle, `${path}/`);
      } else if (pattern.test(handle.name)) {
        // The game can replace a file while the folder is read.
        await addFile(handle, path).catch((error) => {
          if (!isDomException(error, "NotFoundError")) throw error;
        });
      }
    }
  };

  if (root.kind === "file") await addFile(root, root.name);
  else await addDirectory(root, "");
  return { listing, handles };
}
