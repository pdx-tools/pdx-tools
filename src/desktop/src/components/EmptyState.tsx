import {
  FolderOpenIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

interface EmptyStateProps {
  hasSearchQuery: boolean;
}

export default function EmptyState({ hasSearchQuery }: EmptyStateProps) {
  if (hasSearchQuery) {
    return (
      <div className="relative flex flex-col items-center justify-center py-24 text-center">
        {/* Decorative corner elements */}
        <div className="absolute top-8 left-8 h-16 w-16 border-t-2 border-l-2 border-amber-500/20" />
        <div className="absolute top-8 right-8 h-16 w-16 border-t-2 border-r-2 border-amber-500/20" />
        <div className="absolute bottom-8 left-8 h-16 w-16 border-b-2 border-l-2 border-amber-500/20" />
        <div className="absolute right-8 bottom-8 h-16 w-16 border-r-2 border-b-2 border-amber-500/20" />

        <div className="animate-float relative">
          <div className="absolute inset-0 rounded-full bg-slate-500/20 blur-2xl" />
          <MagnifyingGlassIcon className="relative mb-6 h-24 w-24 text-slate-500 shadow-2xl shadow-slate-500/20" />
        </div>

        <h3 className="mb-3 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-3xl font-bold text-transparent">
          No saves found
        </h3>
        <p className="max-w-md text-lg text-slate-300">
          No save games match your search. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-24 text-center">
      {/* Decorative corner elements */}
      <div className="absolute top-8 left-8 h-20 w-20 border-t-2 border-l-2 border-amber-500/20" />
      <div className="absolute top-8 right-8 h-20 w-20 border-t-2 border-r-2 border-amber-500/20" />
      <div className="absolute bottom-8 left-8 h-20 w-20 border-b-2 border-l-2 border-amber-500/20" />
      <div className="absolute right-8 bottom-8 h-20 w-20 border-r-2 border-b-2 border-amber-500/20" />

      <div className="animate-float relative mb-8">
        <div className="absolute inset-0 rounded-full bg-slate-500/20 blur-2xl" />
        <FolderOpenIcon className="relative h-24 w-24 text-slate-500 shadow-2xl shadow-slate-500/20" />
      </div>

      <h3 className="mb-4 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-3xl font-bold text-transparent">
        No save games found
      </h3>

      <p className="mb-3 max-w-md text-lg text-slate-300">
        No Europa Universalis V save files were found in your saves directory.
      </p>

      <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-2">
        <span className="font-mono text-sm text-amber-400/80">
          Documents/Paradox Interactive/Europa Universalis V/save games
        </span>
      </div>

      <p className="max-w-md text-base text-slate-400">
        Play a game in Europa Universalis V and save it to see it here.
      </p>
    </div>
  );
}
