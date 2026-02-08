export default function SaveListHeader() {
  return (
    <header className="relative border-b border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 backdrop-blur overflow-hidden">
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.05),transparent_50%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4">
          {/* Multi-layer icon with glow */}
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/20 rounded-xl blur-xl" />
            <div className="relative w-14 h-14 bg-gradient-to-br from-amber-600 to-amber-400 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 border border-amber-400/30">
              <svg
                className="w-8 h-8 text-white drop-shadow-lg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>

          {/* Enhanced typography */}
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
              EU5 Save Browser
            </h1>
            <p className="text-sm text-amber-200/60 font-medium">
              Explore your Europa Universalis V playthroughs
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
