import { cx } from "class-variance-authority";
import ExclamationTriangleIcon from "@heroicons/react/24/outline/ExclamationTriangleIcon";
import EyeIcon from "@heroicons/react/24/outline/EyeIcon";
import PauseIcon from "@heroicons/react/24/outline/PauseIcon";
import type { WatchStatus } from "./status";

export function StatusIcon({ status, className }: { status: WatchStatus; className?: string }) {
  const Icon = status.isWarning
    ? ExclamationTriangleIcon
    : status.kind === "paused"
      ? PauseIcon
      : EyeIcon;
  return <Icon aria-hidden className={cx("size-4 shrink-0", className)} />;
}
