import React, { useState } from "react";
import { pdxApi } from "@/services/appApi";
import { Button, type ButtonProps } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { toast } from "sonner";
import { TrashIcon } from "@heroicons/react/24/outline";

interface DeleteSaveProps extends ButtonProps {
  saveId: string;
}

export const DeleteSave = ({ saveId, ...rest }: DeleteSaveProps) => {
  const [open, setOpen] = useState(false);
  const saveDeletion = pdxApi.save.useDelete();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button {...rest}>
          <TrashIcon className="h-8 w-8 text-gray-600 transition-colors hover:text-rose-500 dark:text-gray-400" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Are you sure this save should be deleted?</Dialog.Title>
          <Dialog.Description>
            The save will no longer be accessible and any records will be
            removed
          </Dialog.Description>
        </Dialog.Header>

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button>No</Button>
          </Dialog.Close>
          <Button
            className="items-center gap-2"
            variant="danger"
            onClick={() =>
              saveDeletion.mutate(saveId, {
                onSuccess: () => {
                  setOpen(false);
                  toast.success("Save deleted", {
                    duration: 1000,
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
            {saveDeletion.isPending ? (
              <LoadingIcon className="h-4 w-4 text-gray-800" />
            ) : null}{" "}
            Yes, Delete
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
