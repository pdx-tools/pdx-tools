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
    <div className="mb-6 bg-slate-800/50 backdrop-blur rounded-lg border border-slate-700 p-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name, date, or version..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>

        <div className="flex gap-3">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
            <Select.Trigger className="min-w-[140px] px-3 py-2">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="modified">Last Modified</Select.Item>
              <Select.Item value="date">Game Date</Select.Item>
              <Select.Item value="name">Name</Select.Item>
            </Select.Content>
          </Select>

          <Button
            onClick={toggleSortOrder}
            variant="default"
            className="px-3"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </Button>

          <Button
            onClick={onRescan}
            disabled={isScanning}
            variant="default"
            className="gap-2"
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
