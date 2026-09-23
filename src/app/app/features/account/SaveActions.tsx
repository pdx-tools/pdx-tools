import { useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, LinkIcon } from "@heroicons/react/24/outline";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { Link } from "@/components/Link";
import { Tooltip } from "@/components/Tooltip";
import { toast } from "@/lib/toast";
import { DeleteSave } from "@/features/eu4/components/DeleteSave";

import { iconAction } from "./iconAction";

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

/**
 * Put the save's permalink on the clipboard. Sharing is the job this page
 * exists for, so the link is one press away and the button confirms in place
 * rather than only in a toast.
 */
export function CopyLinkButton({ path }: { path: string }) {
  const { copied, copy } = useCopyLink(path);

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button
          variant="ghost"
          shape="none"
          aria-label={copied ? "Link copied" : "Copy link"}
          className={cx(iconAction, copied && "text-green-700 dark:text-green-400")}
          onClick={copy}
        >
          {copied ? <CheckIcon className="h-5 w-5" /> : <LinkIcon className="h-5 w-5" />}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{copied ? "Copied" : "Copy link"}</Tooltip.Content>
    </Tooltip>
  );
}

export function OpenSaveLink({ path }: { path: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Link className={iconAction} to={path} target="_blank" aria-label="Open save">
          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Content>Open in a new tab</Tooltip.Content>
    </Tooltip>
  );
}

/** The three things one can do with a shared save: copy, open, and (if allowed) delete. */
export function SaveActions({
  path,
  saveId,
  game,
  label,
  canDelete,
}: {
  path: string;
  saveId: string;
  game: "eu4" | "eu5";
  label: string;
  canDelete: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <CopyLinkButton path={path} />
      <OpenSaveLink path={path} />
      {canDelete && <DeleteSave saveId={saveId} game={game} label={label} />}
    </div>
  );
}
