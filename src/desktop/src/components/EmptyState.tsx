import { FolderOpenIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export default function EmptyState({ hasSearchQuery }: EmptyStateProps) {
  if (hasSearchQuery) {
    return (
      <div className="relative flex flex-col items-center justify-center py-24 text-center">
        {/* Decorative corner elements */}
        <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-amber-500/20" />
        <div className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 border-amber-500/20" />
        <div className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 border-amber-500/20" />
        <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-amber-500/20" />

        <div className="relative animate-float">
          <div className="absolute inset-0 bg-slate-500/20 rounded-full blur-2xl" />
          <MagnifyingGlassIcon className="relative w-24 h-24 text-slate-500 mb-6 shadow-2xl shadow-slate-500/20" />
        </div>

        <h3 className="text-3xl font-bold mb-3 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
          No saves found
        </h3>
        <p className="text-slate-300 text-lg max-w-md">
          No save games match your search. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-24 text-center">
      {/* Decorative corner elements */}
      <div className="absolute top-8 left-8 w-20 h-20 border-l-2 border-t-2 border-amber-500/20" />
      <div className="absolute top-8 right-8 w-20 h-20 border-r-2 border-t-2 border-amber-500/20" />
      <div className="absolute bottom-8 left-8 w-20 h-20 border-l-2 border-b-2 border-amber-500/20" />
      <div className="absolute bottom-8 right-8 w-20 h-20 border-r-2 border-b-2 border-amber-500/20" />

      <div className="relative animate-float mb-8">
        <div className="absolute inset-0 bg-slate-500/20 rounded-full blur-2xl" />
        <FolderOpenIcon className="relative w-24 h-24 text-slate-500 shadow-2xl shadow-slate-500/20" />
      </div>

      <h3 className="text-3xl font-bold mb-4 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
        No save games found
      </h3>

      <p className="text-slate-300 text-lg max-w-md mb-3">
        No Europa Universalis V save files were found in your saves directory.
      </p>

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 mb-6">
        <span className="text-sm text-amber-400/80 font-mono">
          Documents/Paradox Interactive/Europa Universalis V/save games
        </span>
      </div>

      <p className="text-slate-400 text-base max-w-md">
        Play a game in Europa Universalis V and save it to see it here.
      </p>
    </div>
  );
}
