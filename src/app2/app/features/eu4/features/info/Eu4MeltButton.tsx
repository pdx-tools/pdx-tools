import { MeltButton, meltSave } from "@/components/MeltButton";
import { useEu4Meta, useSaveFilename } from "../../store";
import { getEu4Worker } from "../../worker";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { useState } from "react";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";

export function Eu4MeltButton() {
  const meta = useEu4Meta();
  const filename = useSaveFilename();

  if (!meta.is_random_new_world) {
    return (
      <MeltButton game="eu4" worker={getEu4Worker()} filename={filename} />
    );
  } else {
    return <MeltRnw />;
  }
}

function MeltRnw() {
  const [open, setOpen] = useState(false);
  const filename = useSaveFilename();
  const { isLoading: loading, run: melt } = useTriggeredAction({
    action: () => meltSave("eu4", filename, getEu4Worker()),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>Melt</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Melt a random new world save?</Dialog.Title>
          <Dialog.Description>
            Random new world saves are not supported in EU4 after melting
          </Dialog.Description>
        </Dialog.Header>

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button>Cancel</Button>
          </Dialog.Close>
          <Button className="items-center gap-2" onClick={melt}>
            {loading ? <LoadingIcon className="h-4 w-4 text-gray-800" /> : null}{" "}
            Melt
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
