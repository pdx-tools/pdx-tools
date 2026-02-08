import {
  useEffect,
  useState,
} from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  loadSaveForRenderer,
} from "../lib/tauri";
import type { SaveFileInfo } from "../lib/tauri";
import { useMapInteractions } from "./useMapInteractions";

interface SaveMapViewProps {
  save: SaveFileInfo;
  gamePath: string;
  onBack: () => void;
}

export default function SaveMapView({
  save,
  gamePath,
  onBack,
}: SaveMapViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMapReady = !isLoading && !error;
  useMapInteractions(isMapReady);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        await loadSaveForRenderer(save.filePath, gamePath);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [gamePath, save.filePath]);

  return (
    <div
      className={`pointer-events-none relative min-h-screen text-white ${
        isMapReady ? "bg-transparent" : "bg-slate-950"
      }`}
    >
      <div className="pointer-events-auto absolute top-6 left-6 z-50">
        <Button
          data-map-input-stop="true"
          onClick={onBack}
          variant="default"
          className="gap-2 border border-slate-600/70 bg-slate-900/55 backdrop-blur-xl hover:bg-slate-800/65"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to List
        </Button>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-start justify-center p-8 pt-24">
        {isLoading && (
          <div className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/55 p-8 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <div>
                <p className="text-lg font-semibold text-amber-100">
                  Loading map data...
                </p>
                <p className="text-sm text-slate-300">
                  Parsing save file and processing EU5 game installation in
                  parallel.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-rose-500/50 bg-slate-900/65 p-8 backdrop-blur-xl">
            <h2 className="mb-3 text-2xl font-bold text-rose-200">
              Failed to load save
            </h2>
            <p className="mb-6 text-slate-200">{error}</p>
            <Button onClick={onBack}>Return to List</Button>
          </div>
        )}

        {!isLoading && !error && null}
      </div>
    </div>
  );
}
