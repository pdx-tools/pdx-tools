import { isSaveLoaded } from "@/features/engine/engineStore";
import { emitEvent } from "@/lib/events";
import { markStaleVersion } from "@/lib/staleVersion";
import { toast } from "@/lib/toast";

const TOAST_ID = "preload-error-new-version";

// See vite load error handling: https://vite.dev/guide/build#load-error-handling
export function registerPreloadErrorHandler() {
  if (typeof window === "undefined") {
    return;
  }

  let prompted = false;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    markStaleVersion();

    const saveLoaded = isSaveLoaded();
    emitEvent({ kind: "Preload error", saveLoaded });

    if (!saveLoaded) {
      // Nothing in memory to lose; reload to pick up the new asset manifest.
      window.location.reload();
      return;
    }

    // A save is being analyzed. Reloading would discard that work, so prompt
    // instead of forcing it. Deduped so repeated chunk failures don't stack.
    if (prompted) {
      return;
    }
    prompted = true;

    toast.info("A new version of PDX Tools is available", {
      description: "Reload to load the latest. Your current analysis will be lost.",
      duration: Infinity,
      closeButton: true,
      id: TOAST_ID,
      action: { label: "Reload", onClick: () => window.location.reload() },
    });
  });
}
