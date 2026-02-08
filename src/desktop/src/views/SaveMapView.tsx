import { useState, useEffect } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { LoadingState } from "@/components/LoadingState";
import { readSaveFile } from "../lib/tauri";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { SaveFileInfo } from "../lib/tauri";

interface SaveMapViewProps {
  save: SaveFileInfo;
  onBack: () => void;
}

export default function SaveMapView({ save, onBack }: SaveMapViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveData, setSaveData] = useState<Uint8Array | null>(null);

  useEffect(() => {
    const loadSave = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await readSaveFile(save.filePath);
        setSaveData(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadSave();
  }, [save.filePath]);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Back button overlay */}
      <div className="absolute top-4 left-4 z-50">
        <Button onClick={onBack} variant="default" className="gap-2 bg-slate-800/90 backdrop-blur">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to List
        </Button>
      </div>

      {/* Content */}
      <div className="flex items-center justify-center min-h-screen">
        {isLoading && (
          <div className="text-center">
            <LoadingState />
            <p className="mt-4 text-slate-400">Loading save file...</p>
          </div>
        )}

        {error && (
          <div className="text-center max-w-md">
            <svg
              className="w-16 h-16 text-red-400 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-white mb-2">
              Failed to load save
            </h3>
            <p className="text-slate-400 mb-4">{error}</p>
            <Button onClick={onBack}>Return to List</Button>
          </div>
        )}

        {!isLoading && !error && saveData && (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {save.playthroughName}
            </h2>
            <p className="text-slate-400 mb-1">Game Date: {save.date}</p>
            <p className="text-slate-400 mb-6">Version {save.version}</p>
            <div className="inline-block bg-slate-800 border border-slate-700 rounded-lg p-6">
              <p className="text-slate-300 mb-4">
                Map visualization coming soon!
              </p>
              <p className="text-sm text-slate-500">
                Save file loaded successfully ({(saveData.length / (1024 * 1024)).toFixed(2)} MB)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
