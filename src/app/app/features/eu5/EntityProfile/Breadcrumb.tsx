import { usePanelNav } from "./PanelNavContext";

export interface BreadcrumbItem {
  label: string;
  depth: number;
}

export function getBreadcrumbItems(
  stack: { label: string }[],
  rootLabel: string | undefined,
): BreadcrumbItem[] {
  if (stack.length === 0 || rootLabel == null) return [];
  return [
    { label: rootLabel, depth: 0 },
    ...stack.slice(0, -1).map((entry, i) => ({ label: entry.label, depth: i + 1 })),
  ];
}

export function Breadcrumb() {
  const nav = usePanelNav();
  const crumbs = getBreadcrumbItems(nav.stack, nav.rootLabel);
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 px-4 py-2"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((entry) => (
          <li key={entry.depth}>
            <button
              type="button"
              onClick={() => nav.popTo(entry.depth)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <span>←</span>
              <span>{entry.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
