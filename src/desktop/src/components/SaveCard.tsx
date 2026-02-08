import { DocumentTextIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TimeAgo } from "@/components/TimeAgo";
import { formatInt } from "@/lib/format";
import type { SaveFileInfo } from "../lib/tauri";

interface SaveCardProps {
  save: SaveFileInfo;
  onClick: () => void;
}

export default function SaveCard({ save, onClick }: SaveCardProps) {
  const fileSizeMB = (save.fileSize / (1024 * 1024)).toFixed(2);

  return (
    <Card
      onClick={onClick}
      className="group relative cursor-pointer bg-gradient-to-br from-slate-800 to-slate-850 border-2 border-slate-700/50 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10 hover:-translate-y-1 transition-all duration-300 p-5 overflow-hidden"
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.03),transparent_50%)] pointer-events-none" />

      <div className="relative flex items-start gap-4 mb-4">
        {/* Icon container with gradient and pulsing ring */}
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-md group-hover:animate-pulse-ring" />
          <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center">
            <DocumentTextIcon className="w-6 h-6 text-amber-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate group-hover:text-amber-400 transition-colors mb-2">
            {save.playthroughName}
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="blue" className="text-xs bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/80 dark:to-amber-800/60 border border-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold">
              v{save.version}
            </Badge>
          </div>
        </div>
      </div>

      <div className="relative space-y-2.5 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 flex-shrink-0 text-amber-400/70" />
          <span className="font-medium">{save.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0 text-amber-400/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <TimeAgo date={new Date(save.modifiedTime * 1000).toISOString()} />
        </div>
      </div>

      {/* Wax seal-inspired file size badge */}
      <div className="absolute bottom-4 right-4">
        <div className="relative">
          <div className="absolute inset-0 bg-rose-600/20 rounded-full blur-sm" />
          <div className="relative px-3 py-1 rounded-full bg-gradient-to-br from-rose-900/80 to-rose-800/60 border border-rose-600/40 text-xs font-bold text-rose-200">
            {fileSizeMB} MB
          </div>
        </div>
      </div>

      {/* Hover indicator */}
      <div className="absolute bottom-4 left-5 text-xs text-amber-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
        Open →
      </div>
    </Card>
  );
}
