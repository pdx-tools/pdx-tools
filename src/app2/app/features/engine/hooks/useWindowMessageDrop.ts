import { useEffect } from "react";
import { useFilePublisher } from "./useFilePublisher";

export function useWindowMessageDrop() {
  const publishFile = useFilePublisher();

  useEffect(() => {
    async function messenger(e: MessageEvent) {
      if (
        e.origin === "null" ||
        (new URL(e.origin).hostname == "localhost" && e.data instanceof File)
      ) {
        publishFile({ kind: "file", file: e.data });
      }
    }

    if (window.opener) {
      window.opener.postMessage("rakaly-loaded", "*");
      window.opener.postMessage("pdx-tools-loaded", "*");
      window.addEventListener("message", messenger);
      return () => {
        window.removeEventListener("message", messenger);
      };
    }
  }, [publishFile]);
}
