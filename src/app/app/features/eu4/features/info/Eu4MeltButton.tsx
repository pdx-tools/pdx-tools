import { MeltButton, meltSave } from "@/components/MeltButton";
import { useEu4Meta, useEu4ParsedSource, useSaveFilename } from "../../store";
import { getEu4Worker } from "../../worker";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { useState } from "react";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";

/** Melt the save on screen, also when the worker is at another one. */
function useMeltWorker() {
  const source = useEu4ParsedSource();
  return { melt: () => getEu4Worker().melt(source) };
}

export function Eu4MeltButton() {
  const worker = useMeltWorker();
  const meta = useEu4Meta();
  const filename = useSaveFilename();

  if (!meta.is_random_new_world) {
    return <MeltButton game="eu4" worker={worker} filename={filename} />;
  } else {
    return <MeltRnw />;
  }
}

function MeltRnw() {
  const worker = useMeltWorker();
  const [open, setOpen] = useState(false);
  const filename = useSaveFilename();
  const { isLoading: loading, run: melt } = useTriggeredAction({
    action: () => meltSave("eu4", filename, worker),
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
            {loading ? <LoadingIcon className="h-4 w-4 text-gray-800" /> : null} Melt
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
