import { useEffect } from "react";
import { useSaveListStore } from "../stores/saveListStore";
import { getDefaultSaveDirectory, scanSaveDirectory } from "../lib/tauri";
import { getErrorMessage } from "@/lib/getErrorMessage";
import SaveListHeader from "../components/SaveListHeader";
import SaveListToolbar from "../components/SaveListToolbar";
import SaveListGrid from "../components/SaveListGrid";
import ScanErrorDialog from "../components/ScanErrorDialog";
import type { SaveFileInfo } from "../lib/tauri";

interface SaveListViewProps {
  onOpenSave: (save: SaveFileInfo) => void;
}

export default function SaveListView({ onOpenSave }: SaveListViewProps) {
  const {
    isScanning,
    errors,
    setIsScanning,
    setSaves,
    getFilteredSaves,
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
      setSaves([], [
        {
          filePath: "",
          error: getErrorMessage(error),
        },
      ]);
    } finally {
      setIsScanning(false);
    }
  };

  // Auto-scan on mount
  useEffect(() => {
    handleScan();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SaveListHeader />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <SaveListToolbar onRescan={handleScan} />
        <SaveListGrid
          saves={filteredSaves}
          isLoading={isScanning}
          onOpenSave={onOpenSave}
        />
        <ScanErrorDialog errors={errors} />
      </div>
    </div>
  );
}
