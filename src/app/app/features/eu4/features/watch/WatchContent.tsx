import { WatchCountryDetails } from "./WatchCountryDetails";

export const WatchContent = () => {
  return (
    <div className="flex flex-col gap-10">
      <div className="max-w-prose space-y-4">
        <p>
          PDX Tools sees each save the game writes, while a PDX Tools tab is open. The map and this
          ledger follow the game.
        </p>
        <p>
          Ironman files will automatically update every 3 months. Watching an autosave is dependent
          on in-game settings.
        </p>
      </div>
      <WatchCountryDetails />
    </div>
  );
};
