import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/getErrorMessage";

export const ErrorDialog = ({
  error,
  title,
}: {
  error: unknown;
  title: string;
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (error) {
      setOpen(true);
    }
  }, [error]);

  if (!error) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Content>
        <Dialog.Title>{title}</Dialog.Title>
        <div>{getErrorMessage(error)}</div>
        <div className="flex justify-end">
          <Dialog.Close asChild>
            <Button variant="default">Ok</Button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog>
  );
};
