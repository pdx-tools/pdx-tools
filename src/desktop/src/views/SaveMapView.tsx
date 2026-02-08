import {
  useEffect,
  useState,
  type ComponentProps,
  type ComponentType,
} from "react";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { loadSaveForRenderer } from "../lib/tauri";
import type { SaveFileInfo } from "../lib/tauri";

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
  const [resolvedGamePath, setResolvedGamePath] = useState<string>(gamePath);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const resolved = await loadSaveForRenderer(save.filePath, gamePath);
        if (!cancelled) {
          setResolvedGamePath(resolved);
        }
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

  const fileSizeMb = (save.fileSize / (1024 * 1024)).toFixed(2);
  const lastModified = new Date(save.modifiedTime * 1000);

  return (
    <div className="relative min-h-screen bg-transparent text-white">
      <div className="absolute top-6 left-6 z-50">
        <Button
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
          <div className="w-full max-w-2xl rounded-2xl border border-rose-500/50 bg-slate-900/65 p-8 backdrop-blur-xl">
            <h2 className="mb-3 text-2xl font-bold text-rose-200">
              Failed to load save
            </h2>
            <p className="mb-6 text-slate-200">{error}</p>
            <Button onClick={onBack}>Return to List</Button>
          </div>
        )}

        {!isLoading && !error && (
          <div className="w-full space-y-6 rounded-2xl border border-slate-700/70 bg-slate-900/45 p-8 backdrop-blur-xl">
            <div>
              <h1 className="text-3xl font-bold text-amber-100">
                {save.playthroughName}
              </h1>
              <p className="mt-1 text-sm text-amber-200/80">
                Native renderer is active behind this transparent UI.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <InfoCard
                icon={CalendarIcon}
                label="Game Date"
                value={save.date}
              />
              <InfoCard
                icon={ShieldCheckIcon}
                label="Version"
                value={`v${save.version}`}
              />
              <InfoCard
                icon={DocumentTextIcon}
                label="File Size"
                value={`${fileSizeMb} MB`}
              />
              <InfoCard
                icon={ClockIcon}
                label="Modified"
                value={lastModified.toLocaleDateString()}
              />
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-4">
              <Row label="Save File" value={save.filePath} mono />
              <Row label="Game Path" value={resolvedGamePath} mono />
              <Row
                label="Render Status"
                value="Ready (joined save + game data in Rust)"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<ComponentProps<"svg">>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/55 p-4">
      <div className="mb-2 flex items-center gap-2 text-slate-300">
        <Icon className="h-4 w-4" />
        <span className="text-xs tracking-wide uppercase">{label}</span>
      </div>
      <p className="font-semibold text-white">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <p className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3">
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span
        className={
          mono ? "font-mono break-all text-slate-200" : "text-slate-200"
        }
      >
        {value}
      </span>
    </p>
  );
}
