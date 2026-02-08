import { FolderOpenIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export default function EmptyState({ hasSearchQuery }: EmptyStateProps) {
  if (hasSearchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <MagnifyingGlassIcon className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          No saves found
        </h3>
        <p className="text-slate-400 max-w-md">
          No save games match your search. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FolderOpenIcon className="w-16 h-16 text-slate-600 mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">
        No save games found
      </h3>
      <p className="text-slate-400 max-w-md mb-2">
        No Europa Universalis V save files were found in your saves directory.
      </p>
      <p className="text-sm text-slate-500 font-mono">
        Documents/Paradox Interactive/Europa Universalis V/save games
      </p>
      <p className="text-slate-400 max-w-md mt-4">
        Play a game in Europa Universalis V and save it to see it here.
      </p>
    </div>
  );
}
