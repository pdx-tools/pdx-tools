import { useState } from "react";
import {
  Eu4Worker,
  FileObservationFrequency,
  useEu4Worker,
} from "../../worker";
import { useEu4Actions, useWatcher } from "../../store";
import { Button } from "@/components/Button";
import { WatchCountryDetails } from "./WatchCountryDetails";
import { ToggleGroup } from "@/components/ToggleGroup";
import { Alert } from "@/components/Alert";

const FallbackMessage = () => {
  return (
    <p className="max-w-prose">
      Your browser does not support watching for file changes. Please use a
      browser that supports the{" "}
      <a
        target="_blank"
        rel="noreferrer"
        href="https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker#browser_compatibility"
      >
        FileSystemFileHandle API
      </a>
      . Chrome and other Chromium based browsers recommended.
    </p>
  );
};

const supportedFn = (arg: Eu4Worker) => arg.supportsFileObserver();
export const WatchContent = () => {
  const supported = useEu4Worker(supportedFn);
  const watcher = useWatcher();
  const actions = useEu4Actions();
  const defaultFrequency = "Monthly";
  const [updateFrequency, setUpdateFrequency] =
    useState<FileObservationFrequency>(defaultFrequency);

  if (supported.error) {
    return <Alert.Error msg={supported.error} />;
  }

  if (supported.data !== true) {
    return <FallbackMessage />;
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="mb-0 max-w-prose space-y-4">
        <p>
          Watching a save will update PDX Tools whenever the choosen elapsed
          amount of time has passed in the loaded save.
        </p>
        <p>
          {
            "“Any Modification” will update whenever the save file is written (eg: exploit dev and then save the game)."
          }
        </p>
        <p>
          Ironman files will automatically update every 3 months. Watching an
          autosave is dependent on in-game settings.
        </p>
      </div>
      <div className="flex gap-12">
        <ToggleGroup
          type="single"
          disabled={watcher.status !== "idle"}
          className="inline-flex self-center"
          defaultValue={defaultFrequency}
          onValueChange={(x) =>
            x && setUpdateFrequency(x as FileObservationFrequency)
          }
          aria-label="update frequency"
        >
          <ToggleGroup.Item
            value={"EverySave" satisfies FileObservationFrequency}
            asChild
          >
            <Button shape="none" className="px-4 py-2">
              Any Modification
            </Button>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value={"Daily" satisfies FileObservationFrequency}
            asChild
          >
            <Button shape="none" className="px-4 py-2">
              Daily
            </Button>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value={"Monthly" satisfies FileObservationFrequency}
            asChild
          >
            <Button shape="none" className="px-4 py-2">
              Monthly
            </Button>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value={"Yearly" satisfies FileObservationFrequency}
            asChild
          >
            <Button shape="none" className="px-4 py-2">
              Yearly
            </Button>
          </ToggleGroup.Item>
        </ToggleGroup>
        <div className="flex gap-2">
          <Button
            onClick={() => actions.startWatcher(updateFrequency)}
            disabled={watcher.status !== "idle"}
          >
            Start
          </Button>
          <Button
            disabled={watcher.status === "idle"}
            onClick={() => actions.stopWatcher()}
          >
            Stop
          </Button>
        </div>
      </div>
      <WatchCountryDetails />
    </div>
  );
};
