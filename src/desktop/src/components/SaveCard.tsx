import { DocumentTextIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TimeAgo } from "@/components/TimeAgo";
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
      className="group relative cursor-pointer overflow-hidden border-2 border-slate-700/60 bg-slate-900/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10"
    >
      {/* Subtle background pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.03),transparent_50%)]" />

      <div className="relative mb-4 flex items-start gap-4">
        {/* Icon container with gradient and pulsing ring */}
        <div className="relative flex-shrink-0">
          <div className="group-hover:animate-pulse-ring absolute inset-0 rounded-full bg-amber-500/20 blur-md" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-amber-600/10">
            <DocumentTextIcon className="h-6 w-6 text-amber-400" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="mb-2 truncate text-lg font-bold text-white transition-colors group-hover:text-amber-400">
            {save.playthroughName}
          </h3>
          <div className="flex items-center gap-2">
            <Badge
              variant="blue"
              className="border border-amber-500/30 bg-gradient-to-br from-amber-100 to-amber-200 px-3 py-1 text-xs font-semibold text-amber-900 dark:from-amber-900/80 dark:to-amber-800/60 dark:text-amber-100"
            >
              v{save.version}
            </Badge>
          </div>
        </div>
      </div>

      <div className="relative space-y-2.5 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 flex-shrink-0 text-amber-400/70" />
          <span className="font-medium">{save.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-amber-400/70"
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
      <div className="absolute right-4 bottom-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-rose-600/20 blur-sm" />
          <div className="relative rounded-full border border-rose-600/40 bg-gradient-to-br from-rose-900/80 to-rose-800/60 px-3 py-1.5 text-xs font-bold text-rose-200">
            {fileSizeMB} MB
          </div>
        </div>
      </div>

      {/* Hover indicator - positioned to avoid clipping */}
      <div className="mt-4 border-t border-slate-700/30 pt-3">
        <div className="text-xs font-semibold text-amber-400 opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </div>
      </div>
    </Card>
  );
}
