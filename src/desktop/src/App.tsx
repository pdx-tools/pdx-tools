import { useState } from "react";
import SaveListView from "./views/SaveListView";
import SaveMapView from "./views/SaveMapView";
import type { SaveFileInfo } from "./lib/tauri";

type ViewState =
  | { kind: "list" }
  | { kind: "map"; save: SaveFileInfo; gamePath: string };

export default function App() {
  const [view, setView] = useState<ViewState>({ kind: "list" });

  const handleOpenSave = (save: SaveFileInfo, gamePath: string) => {
    setView({ kind: "map", save, gamePath });
  };

  const handleBack = () => {
    setView({ kind: "list" });
  };

  if (view.kind === "map") {
    return (
      <SaveMapView
        save={view.save}
        gamePath={view.gamePath}
        onBack={handleBack}
      />
    );
  }

  return <SaveListView onOpenSave={handleOpenSave} />;
}
