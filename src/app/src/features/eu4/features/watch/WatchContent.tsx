import { useState } from "react";
import { Eu4Worker, useEu4Worker } from "../../worker";
import { useEu4Actions, useWatcher } from "../../store";
import { Button, Radio } from "antd";
import { WatchCountryDetails } from "./WatchCountryDetails";

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
  const defaultFrequency = "monthly";
  const [updateFrequency, setUpdateFrequency] = useState(defaultFrequency);

  if (supported.data !== true) {
    return <FallbackMessage />;
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="mb-0 max-w-prose">
        Watching a save will update PDX Tools whenever the choosen elapsed
        amount of time has passed in the loaded save. Ironman files will
        automatically update every 3 months. Watching an autosave is dependent
        on in-game settings.
      </p>
      <div className="flex gap-12">
        <Radio.Group
          disabled={watcher.status !== "idle"}
          onChange={(e) => setUpdateFrequency(e.target.value)}
          defaultValue={defaultFrequency}
        >
          <Radio.Button value="daily">Daily</Radio.Button>
          <Radio.Button value="monthly">Monthly</Radio.Button>
          <Radio.Button value="yearly">Yearly</Radio.Button>
        </Radio.Group>
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
