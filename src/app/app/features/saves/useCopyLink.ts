import { useState } from "react";
import { toast } from "@/lib/toast";

/**
 * Put a permalink on the clipboard. The caller shows `copied` in place for a
 * short time, so the confirmation is where the reader already looks, and a
 * toast is only for the failure.
 */
export function useCopyLink(path: string) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the link", { description: url, duration: 5000 });
    }
  };

  return { copied, copy };
}
