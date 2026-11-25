import { useNavigate } from "react-router";
import { useEngineActions } from "@/features/engine";
import { localSaveInput, localSaveRegistry } from "@/features/campaign/localSaves";
import { toast } from "@/lib/toast";
import { keptHandle } from "./bytes";
import { COPY_MISSING } from "./text";
import type { KeptSave } from "./types";
import { holdKept } from "./watchService";

/** Open a kept save in this tab, from any page. */
export function useOpenKept() {
  const { fileInput } = useEngineActions();
  const navigate = useNavigate();
  return async (save: KeptSave, options: { replace?: boolean } = {}) => {
    // No tab can delete the copy from here until the page holds it.
    const { granted, release } = holdKept(save.hash);
    await granted;
    try {
      const file = await keptHandle(save.hash);
      if (file === null) {
        toast.error(COPY_MISSING);
        return;
      }
      const { ref } = localSaveRegistry.addKept(save, file);
      fileInput(localSaveInput(save.game, ref));
    } finally {
      release();
    }
    await navigate("/", options);
  };
}
