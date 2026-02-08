import { useEffect } from "react";
import { useSaveListStore } from "../stores/saveListStore";
import {
  detectEu5GamePath,
  getDefaultSaveDirectory,
  scanSaveDirectory,
} from "../lib/tauri";
import { getErrorMessage } from "@/lib/getErrorMessage";
import SaveListHeader from "../components/SaveListHeader";
import SaveListToolbar from "../components/SaveListToolbar";
import SaveListGrid from "../components/SaveListGrid";
import ScanErrorDialog from "../components/ScanErrorDialog";
import type { SaveFileInfo } from "../lib/tauri";

interface SaveListViewProps {
  onOpenSave: (save: SaveFileInfo, gamePath: string) => void;
}

export default function SaveListView({ onOpenSave }: SaveListViewProps) {
  const {
    isScanning,
    errors,
    setIsScanning,
    setSaves,
    getFilteredSaves,
    gamePath,
    setGamePath,
    setGamePathError,
  } = useSaveListStore();

  const filteredSaves = getFilteredSaves();

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const directory = await getDefaultSaveDirectory();
      const result = await scanSaveDirectory(directory);
      setSaves(result.saves, result.errors);
    } catch (error) {
      console.error("Failed to scan save directory:", error);
      setSaves(
        [],
        [
          {
            filePath: "",
            error: getErrorMessage(error),
          },
        ],
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpenSave = (save: SaveFileInfo) => {
    const resolvedGamePath = gamePath.trim();
    if (!resolvedGamePath) {
      setGamePathError(
        "EU5 game path is required. Set a Steam install or bundle path before opening a save.",
      );
      return;
    }

    setGamePathError(null);
    onOpenSave(save, resolvedGamePath);
  };

  // Auto-scan on mount.
  useEffect(() => {
    void handleScan();
  }, []);

  // Auto-detect Steam EU5 install if no persisted path exists.
  useEffect(() => {
    if (gamePath.trim()) {
      return;
    }

    let cancelled = false;
    void detectEu5GamePath()
      .then((detectedPath) => {
        if (!cancelled && detectedPath && !gamePath.trim()) {
          setGamePath(detectedPath);
        }
      })
      .catch((error) => {
        console.warn("Failed to auto-detect EU5 game path:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [gamePath, setGamePath]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SaveListHeader />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <SaveListToolbar onRescan={handleScan} />
        <SaveListGrid
          saves={filteredSaves}
          isLoading={isScanning}
          onOpenSave={handleOpenSave}
        />
        <ScanErrorDialog errors={errors} />
      </div>
    </div>
  );
}
