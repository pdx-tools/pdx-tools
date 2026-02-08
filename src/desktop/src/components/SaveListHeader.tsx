export default function SaveListHeader() {
  return (
    <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
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
          <div>
            <h1 className="text-2xl font-bold text-white">EU5 Save Browser</h1>
            <p className="text-sm text-slate-400">
              Explore your Europa Universalis V playthroughs
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
