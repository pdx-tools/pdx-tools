import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import SaveCard from "./SaveCard";
import EmptyState from "./EmptyState";
import { LoadingState } from "@/components/LoadingState";
import type { SaveFileInfo } from "../lib/tauri";
import { useSaveListStore } from "../stores/saveListStore";

interface SaveListGridProps {
  saves: SaveFileInfo[];
  isLoading: boolean;
  onOpenSave: (save: SaveFileInfo) => void;
}

export default function SaveListGrid({
  saves,
  isLoading,
  onOpenSave,
}: SaveListGridProps) {
  const searchQuery = useSaveListStore((state) => state.searchQuery);
  const parentRef = useRef<HTMLDivElement>(null);

  // Use virtualization for large lists (100+ items)
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(saves.length / 3), // 3 columns
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220, // Estimated row height
    overscan: 2,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingState />
      </div>
    );
  }

  if (saves.length === 0) {
    return <EmptyState hasSearchQuery={!!searchQuery.trim()} />;
  }

  // For smaller lists, use regular grid with stagger animation
  if (saves.length < 100) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {saves.map((save, index) => (
          <div
            key={save.playthroughId + save.modifiedTime}
            className="animate-fadeInUp"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <SaveCard
              save={save}
              onClick={() => onOpenSave(save)}
            />
          </div>
        ))}
      </div>
    );
  }

  // For large lists, use virtualization
  return (
    <div ref={parentRef} className="h-[calc(100vh-300px)] overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * 3;
          const rowSaves = saves.slice(startIndex, startIndex + 3);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-1">
                {rowSaves.map((save) => (
                  <SaveCard
                    key={save.playthroughId + save.modifiedTime}
                    save={save}
                    onClick={() => onOpenSave(save)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
