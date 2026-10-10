import { toast } from "@/lib/toast";
import { openFailureText } from "./saveText";
import type { CampaignNav } from "./useCampaignNav";
import type { CampaignSave, OpenResult } from "./types";

/** Open a save and show its load error from any campaign control. */
export async function openCampaignSave(
  nav: Pick<CampaignNav, "open">,
  save: CampaignSave,
): Promise<OpenResult> {
  const result = await nav.open(save);
  if (result.kind === "failed" && result.failure.kind === "load") {
    toast.error("Could not open the save", { description: openFailureText(result.failure) });
  }
  return result;
}
