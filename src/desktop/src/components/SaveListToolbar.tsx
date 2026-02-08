import { MagnifyingGlassIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
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
    setSearchQuery,
    setSortBy,
    toggleSortOrder,
  } = useSaveListStore();

  return (
    <div className="mb-6 bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-5 shadow-2xl">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative group">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-400 transition-colors" />
          <Input
            type="text"
            placeholder="Search by name, date, or version..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10 w-full h-10 px-4 focus:border-amber-500/50 focus:ring-amber-500/20 focus:shadow-lg focus:shadow-amber-500/10 transition-all duration-200"
          />
        </div>

        <div className="flex gap-3">
          <div className="relative group">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
              <Select.Trigger className="min-w-[140px] px-3 py-2 h-10 transition-all duration-200 hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-transparent hover:border-amber-500/30">
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
            className="px-3 h-10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all duration-200"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </Button>

          <Button
            onClick={onRescan}
            disabled={isScanning}
            variant="default"
            className="gap-2 h-10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all duration-200 disabled:opacity-50"
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`}
            />
            Rescan
          </Button>
        </div>
      </div>
    </div>
  );
}
