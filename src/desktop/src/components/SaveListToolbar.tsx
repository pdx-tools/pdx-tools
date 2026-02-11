import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useSaveListStore } from "../stores/saveListStore";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";

interface SaveListToolbarProps {
  onRescan: () => void;
}

export default function SaveListToolbar({ onRescan }: SaveListToolbarProps) {
  const {
    searchQuery,
    sortBy,
    sortOrder,
    isScanning,
    gamePath,
    gamePathError,
    setSearchQuery,
    setSortBy,
    toggleSortOrder,
    setGamePath,
  } = useSaveListStore();

  return (
    <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-900/45 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-3">
        <div className="group relative">
          <Input
            type="text"
            value={gamePath}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setGamePath(e.target.value)
            }
            placeholder="EU5 game path (Steam install, optimized bundle zip, or raw bundle zip)"
            className="h-10 w-full px-4 font-mono text-sm focus:border-amber-500/50 focus:ring-amber-500/20"
          />
          {gamePathError && (
            <p className="mt-2 text-sm text-rose-300">{gamePathError}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="group relative flex-1">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-amber-400" />
            <Input
              type="text"
              placeholder="Search by name, date, or version..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
              className="h-10 w-full px-4 pl-10 transition-all duration-200 focus:border-amber-500/50 focus:shadow-lg focus:shadow-amber-500/10 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex gap-3">
            <div className="group relative">
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as any)}
              >
                <Select.Trigger className="h-10 min-w-[140px] px-3 py-2 transition-all duration-200 hover:border-amber-500/30 hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-transparent">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="modified">Last Modified</Select.Item>
                  <Select.Item value="date">Game Date</Select.Item>
                  <Select.Item value="name">Name</Select.Item>
                </Select.Content>
              </Select>
            </div>

            <Button
              onClick={toggleSortOrder}
              variant="default"
              className="h-10 px-3 transition-all duration-200 hover:border-amber-500/30 hover:bg-amber-500/10"
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </Button>

            <Button
              onClick={onRescan}
              disabled={isScanning}
              variant="default"
              className="h-10 gap-2 transition-all duration-200 hover:border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`}
              />
              Rescan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
