import React, { useState } from "react";
import { useSaveDeletion } from "@/services/appApi";
import { Button, type ButtonProps } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { LoadingIcon } from "@/components/icons/LoadingIcon";

interface DeleteSaveProps extends ButtonProps {
  saveId: string;
}

export const DeleteSave = ({ saveId, ...rest }: DeleteSaveProps) => {
  const [open, setOpen] = useState(false);
  const saveDeletion = useSaveDeletion(saveId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button {...rest}>Delete</Button>
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
              saveDeletion.mutate(undefined, {
                onSuccess: () => setOpen(false),
              })
            }
          >
            {saveDeletion.isLoading ? (
              <LoadingIcon className="h-4 w-4 text-gray-800" />
            ) : null}{" "}
            Yes, Delete
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
