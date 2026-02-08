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
      className="group cursor-pointer bg-slate-800 border-slate-700 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition-all"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <DocumentTextIcon className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white truncate group-hover:text-blue-400 transition-colors">
            {save.playthroughName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="blue" className="text-xs">
              v{save.version}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
          <span>{save.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0"
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

      <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
        <span className="text-xs text-slate-500">{fileSizeMB} MB</span>
        <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Open →
        </span>
      </div>
    </Card>
  );
}
