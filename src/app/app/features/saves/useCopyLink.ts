import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

const COPIED_MS = 1800;

/**
 * Put a permalink on the clipboard. The caller shows `copied` in place for a
 * short time, so the confirmation is where the reader already looks, and a
 * toast is only for the failure.
 */
export function useCopyLink(path: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // A second copy restarts the interval. An unmount stops the timer.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      window.clearTimeout(timer.current);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      toast.error("Could not copy the link", { description: url, duration: 5000 });
    }
  };

  return { copied, copy };
}
