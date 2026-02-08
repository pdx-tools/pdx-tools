import { useState, useEffect } from "react";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ClockIcon
} from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { readSaveFile } from "../lib/tauri";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { formatInt } from "@/lib/format";
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

  const fileSizeMB = (save.fileSize / (1024 * 1024)).toFixed(2);
  const lastModified = new Date(save.modifiedTime * 1000);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Enhanced back button */}
      <div className="absolute top-6 left-6 z-50">
        <Button
          onClick={onBack}
          variant="default"
          className="gap-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 hover:bg-slate-800/70 hover:border-amber-500/30 transition-all duration-200 shadow-xl"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to List
        </Button>
      </div>

      {/* Content */}
      <div className="flex items-center justify-center min-h-screen p-8">
        {isLoading && (
          <div className="text-center">
            {/* Custom compass spinner */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-32 h-32 animate-compass-spin"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Compass rose */}
                  <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" className="text-amber-500/30" />
                  <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="1" className="text-amber-500/20" />
                  <path d="M50 10 L55 40 L50 35 L45 40 Z" fill="currentColor" className="text-amber-500" />
                  <path d="M90 50 L60 55 L65 50 L60 45 Z" fill="currentColor" className="text-amber-400/50" />
                  <path d="M50 90 L45 60 L50 65 L55 60 Z" fill="currentColor" className="text-amber-400/50" />
                  <path d="M10 50 L40 45 L35 50 L40 55 Z" fill="currentColor" className="text-amber-400/50" />
                  <circle cx="50" cy="50" r="5" fill="currentColor" className="text-amber-500" />
                </svg>
              </div>
              {/* Orbital dots */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-400 rounded-full shadow-lg shadow-amber-400/50" />
              </div>
            </div>
            <p className="text-xl text-amber-200/80 font-medium">Loading save file...</p>
          </div>
        )}

        {error && (
          <div className="text-center max-w-md">
            <div className="relative animate-float mb-6">
              <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-2xl" />
              <svg
                className="relative w-20 h-20 text-rose-400 mx-auto shadow-2xl shadow-rose-500/20"
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
            </div>
            <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-rose-200 to-rose-400 bg-clip-text text-transparent">
              Failed to load save
            </h3>
            <p className="text-slate-300 mb-6 text-lg">{error}</p>
            <Button onClick={onBack} className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-amber-500/50">
              Return to List
            </Button>
          </div>
        )}

        {!isLoading && !error && saveData && (
          <div className="w-full max-w-6xl">
            {/* Hero section with decorative corners */}
            <div className="relative mb-12 text-center p-8">
              {/* Decorative corner elements */}
              <div className="absolute top-0 left-0 w-24 h-24 border-l-2 border-t-2 border-amber-500/30" />
              <div className="absolute top-0 right-0 w-24 h-24 border-r-2 border-t-2 border-amber-500/30" />
              <div className="absolute bottom-0 left-0 w-24 h-24 border-l-2 border-b-2 border-amber-500/30" />
              <div className="absolute bottom-0 right-0 w-24 h-24 border-r-2 border-b-2 border-amber-500/30" />

              <div className="relative">
                <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-amber-200 via-amber-100 to-amber-200 bg-clip-text text-transparent drop-shadow-lg">
                  {save.playthroughName}
                </h1>
                <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-gradient-to-r from-amber-900/80 to-amber-800/60 border border-amber-500/40 shadow-lg shadow-amber-500/20">
                  <span className="text-sm font-semibold text-amber-100">Playthrough Details</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {/* Game Date */}
              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-amber-500/30 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center">
                    <CalendarIcon className="w-7 h-7 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Game Date</p>
                    <p className="text-2xl font-bold text-white">{save.date}</p>
                  </div>
                </div>
              </div>

              {/* Version */}
              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-sky-500/30 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-500/20 to-sky-600/10 border border-sky-500/30 flex items-center justify-center">
                    <ShieldCheckIcon className="w-7 h-7 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Version</p>
                    <p className="text-2xl font-bold text-white">v{save.version}</p>
                  </div>
                </div>
              </div>

              {/* File Size */}
              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-emerald-500/30 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center">
                    <DocumentTextIcon className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">File Size</p>
                    <p className="text-2xl font-bold text-white">{fileSizeMB} MB</p>
                  </div>
                </div>
              </div>

              {/* Last Modified */}
              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 shadow-xl hover:border-rose-500/30 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-500/20 to-rose-600/10 border border-rose-500/30 flex items-center justify-center">
                    <ClockIcon className="w-7 h-7 text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Modified</p>
                    <p className="text-lg font-bold text-white">{lastModified.toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save preview section */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-amber-200 mb-4 flex items-center gap-3">
                <span className="w-1 h-8 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full" />
                Save File Details
              </h2>

              {/* Ornate frame */}
              <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-2 border-slate-700/50 rounded-xl p-8 shadow-2xl overflow-hidden">
                {/* Parchment texture background */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.03),transparent_70%)] pointer-events-none" />

                {/* Decorative corner flourishes */}
                <div className="absolute top-2 left-2 w-12 h-12 border-l-2 border-t-2 border-amber-500/40 rounded-tl-lg" />
                <div className="absolute top-2 right-2 w-12 h-12 border-r-2 border-t-2 border-amber-500/40 rounded-tr-lg" />
                <div className="absolute bottom-2 left-2 w-12 h-12 border-l-2 border-b-2 border-amber-500/40 rounded-bl-lg" />
                <div className="absolute bottom-2 right-2 w-12 h-12 border-r-2 border-b-2 border-amber-500/40 rounded-br-lg" />

                <div className="relative space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold min-w-[120px]">File Path:</span>
                    <span className="text-slate-200 font-mono text-sm break-all">{save.filePath}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold min-w-[120px]">Binary Size:</span>
                    <span className="text-slate-200">{formatInt(saveData.length)} bytes</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold min-w-[120px]">Status:</span>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 text-sm font-semibold">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      Successfully Loaded
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-4">
              <Button
                disabled
                className="gap-2 px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-2 border-amber-500/50 hover:border-amber-400/50 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Open in Full Viewer (Coming Soon)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
