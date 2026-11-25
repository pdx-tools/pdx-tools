import { useRef, useState } from "react";
import { cx } from "class-variance-authority";
import EllipsisVerticalIcon from "@heroicons/react/24/outline/EllipsisVerticalIcon";
import EllipsisHorizontalIcon from "@heroicons/react/24/outline/EllipsisHorizontalIcon";
import { Button } from "@/components/Button";
import { DropdownMenu } from "@/components/DropdownMenu";
import { GameButton } from "@/components/game";
import { captureException } from "@/lib/captureException";
import { gameMenu, gameMenuItem, pageMenuItem } from "./styles";
import { formatPageDate } from "./text";
import type { KeptSave } from "./types";
import { downloadKept, noteOpener, requestDelete, requestUpload } from "./ui";
import { act, openKept } from "./watchService";

/** The actions of one kept save. A save that a tab has open cannot be deleted. */
export function KeptSaveMenu({
  save,
  isOpen = false,
  surface,
  onDialog,
  className,
}: {
  save: KeptSave;
  isOpen?: boolean;
  surface: "page" | "game";
  /** Close the popover that the menu is in. Its trigger gets the focus after the dialog. */
  onDialog?: () => void;
  className?: string;
}) {
  const [openElsewhere, setOpenElsewhere] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const hasDialog = useRef(false);
  const cannotDelete = isOpen || openElsewhere;
  const label = `Actions for ${formatPageDate(save.date)}, ${save.name}`;
  const isPage = surface === "page";
  const item = isPage ? pageMenuItem : gameMenuItem;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          hasDialog.current = false;
          noteOpener(trigger.current);
          openKept().then((hashes) => setOpenElsewhere(hashes.has(save.hash)), captureException);
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        {isPage ? (
          <Button
            ref={trigger}
            variant="ghost"
            shape="square"
            aria-label={label}
            className={cx(className, "rounded-md hover:bg-gray-200 dark:hover:bg-slate-700")}
          >
            <EllipsisVerticalIcon aria-hidden className="size-4" />
          </Button>
        ) : (
          <GameButton
            ref={trigger}
            variant="icon"
            aria-label={label}
            className={cx("text-game-ink-300!", className)}
          >
            <EllipsisHorizontalIcon aria-hidden className="size-4" />
          </GameButton>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        className={cx("w-44", !isPage && gameMenu)}
        onCloseAutoFocus={(event) => {
          // The menu can end its exit after the dialog, which gives the focus back.
          if (hasDialog.current) event.preventDefault();
        }}
      >
        <DropdownMenu.Item
          className={item}
          onSelect={() => {
            hasDialog.current = requestUpload(save);
            if (hasDialog.current) onDialog?.();
          }}
        >
          Upload save
        </DropdownMenu.Item>
        <DropdownMenu.Item className={item} onSelect={() => act(downloadKept(save))}>
          Download save
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className={item}
          disabled={cannotDelete}
          onSelect={() => {
            hasDialog.current = true;
            requestDelete([save]);
            onDialog?.();
          }}
        >
          Delete kept save{cannotDelete && " (open)"}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
