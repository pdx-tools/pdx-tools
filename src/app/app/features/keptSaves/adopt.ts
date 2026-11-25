import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { OpenSave } from "@/features/campaign/types";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import { keptHandle } from "./bytes";
import type { KeptSave } from "./types";

/**
 * Make the open save read its kept copy, so that the game can write over the
 * file. The view does not load again. The worker compares the copy with the
 * bytes it parsed, and nothing changes when they differ or when another save
 * opened.
 */
export async function adoptKeptCopy(
  open: OpenSave,
  kept: KeptSave,
  adapter: Pick<CampaignAdapter, "adopt">,
  services = { registry: localSaveRegistry, handleOf: keptHandle },
): Promise<boolean> {
  const { registry, handleOf } = services;
  if (open.source.kind !== "local" || open.source.hash !== kept.hash) return false;
  const { entryId, ref: from } = open.source;
  if (entryId === null || registry.get(entryId)?.kept) return false;
  const handle = await handleOf(kept.hash);
  if (handle === null) return false;
  const ref = {
    kind: "handle",
    file: handle,
    name: registry.get(entryId)?.name ?? kept.name,
  } as const;
  return adapter.adopt({
    from,
    ref,
    file: await handle.getFile(),
    hash: kept.hash,
    commit: () => registry.adopt(entryId, kept, ref),
  });
}
