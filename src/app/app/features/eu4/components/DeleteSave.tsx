import { useState } from "react";
import { pdxApi } from "@/services/appApi";
import { Button } from "@/components/Button";
import type { ButtonProps } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Tooltip } from "@/components/Tooltip";
import { toast } from "@/lib/toast";
import { TrashIcon } from "@heroicons/react/24/outline";
import { cx } from "class-variance-authority";
import { iconAction } from "@/features/account/iconAction";

interface DeleteSaveProps extends ButtonProps {
  saveId: string;
  /** Which table the save lives in. Defaults to EU4. */
  game?: "eu4" | "eu5";
  /** What the confirmation names: a game date, a country, a file. */
  label?: string;
}

export const DeleteSave = ({
  saveId,
  game = "eu4",
  label,
  className,
  ...rest
}: DeleteSaveProps) => {
  const [open, setOpen] = useState(false);
  const eu4Deletion = pdxApi.save.useDelete();
  const eu5Deletion = pdxApi.eu5Save.useDelete();
  const saveDeletion = game === "eu5" ? eu5Deletion : eu4Deletion;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Dialog.Trigger asChild>
            <Button
              variant="ghost"
              shape="none"
              aria-label="Delete save"
              className={cx(
                className ?? iconAction,
                "hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/40 dark:hover:text-rose-300",
              )}
              {...rest}
            >
              <TrashIcon className="h-5 w-5" />
            </Button>
          </Dialog.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Content>Delete save</Tooltip.Content>
      </Tooltip>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Delete {label ? `the ${label} save` : "this save"}?</Dialog.Title>
          <Dialog.Description>
            The permalink stops working for everyone who has it
            {game === "eu4" ? ", and any leaderboard entry from this save is removed" : ""}. This
            cannot be undone.
          </Dialog.Description>
        </Dialog.Header>

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button>Keep it</Button>
          </Dialog.Close>
          <Button
            className="items-center gap-2"
            variant="danger"
            disabled={saveDeletion.isPending}
            onClick={() =>
              saveDeletion.mutate(saveId, {
                onSuccess: () => {
                  setOpen(false);
                  toast.success("Save deleted", {
                    duration: 1500,
                  });
                },
                onError: (e) =>
                  toast.error("Failed to delete", {
                    description: e.message,
                    duration: 5000,
                  }),
              })
            }
          >
            {saveDeletion.isPending ? <LoadingIcon className="h-4 w-4 text-gray-800" /> : null}{" "}
            Delete save
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
