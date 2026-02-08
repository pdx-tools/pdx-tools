import { useState } from "react";
import SaveListView from "./views/SaveListView";
import SaveMapView from "./views/SaveMapView";
import type { SaveFileInfo } from "./lib/tauri";

type ViewState =
  | { kind: "list" }
  | { kind: "map"; save: SaveFileInfo };

export default function App() {
  const [view, setView] = useState<ViewState>({ kind: "list" });

  const handleOpenSave = (save: SaveFileInfo) => {
    setView({ kind: "map", save });
  };

  const handleBack = () => {
    setView({ kind: "list" });
  };

  if (view.kind === "map") {
    return <SaveMapView save={view.save} onBack={handleBack} />;
  }

  return <SaveListView onOpenSave={handleOpenSave} />;
}
