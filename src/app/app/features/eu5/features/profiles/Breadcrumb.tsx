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
      className="flex shrink-0 items-center border-b border-game-line px-4 py-1.5"
    >
      <ol className="flex min-w-0 flex-wrap items-center">
        {crumbs.map((entry, i) => (
          <li key={entry.depth} className="flex items-center">
            {i > 0 && (
              <span aria-hidden="true" className="mx-1.5 text-[11px] text-game-ink-700 select-none">
                ›
              </span>
            )}
            <button
              type="button"
              onClick={() => nav.popTo(entry.depth)}
              className="flex max-w-[160px] items-center gap-1 text-xs text-game-ink-500 hover:text-game-ink-100"
            >
              {i === 0 && <span aria-hidden="true">←</span>}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
