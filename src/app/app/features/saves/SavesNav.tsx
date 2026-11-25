import { cx } from "class-variance-authority";
import { Link } from "@/components/Link";
import type { FeedGame } from "@/server-lib/fn/feed";

/** Links in the form of a segmented control. */
function SegmentedLinks({
  label,
  links,
}: {
  label: string;
  links: readonly { label: string; to: string; active: boolean }[];
}) {
  return (
    <nav
      aria-label={label}
      className="flex w-fit gap-0.5 rounded-md bg-gray-200 p-0.5 dark:bg-slate-700"
    >
      {links.map((link) => (
        <Link
          key={link.label}
          to={link.to}
          variant="ghost"
          replace
          preventScrollReset
          aria-current={link.active ? "page" : undefined}
          className={cx(
            "rounded px-3 py-1 text-sm font-medium outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-sky-600",
            link.active
              ? "bg-white text-black shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-gray-700 hover:bg-gray-300/60 dark:text-gray-300 dark:hover:bg-slate-600",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

const GAMES: readonly { game: FeedGame | undefined; label: string; search: string }[] = [
  { game: undefined, label: "All", search: "" },
  { game: "eu4", label: "EU4", search: "?game=eu4" },
  { game: "eu5", label: "EU5", search: "?game=eu5" },
];

/** The heading of the saves pages: shared or kept, and one game or all. */
export function SavesHeader({
  title,
  path,
  game,
}: {
  title: string;
  path: "/saves" | "/saves/kept";
  game: FeedGame | undefined;
}) {
  const { search } = GAMES.find((x) => x.game === game)!;
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{title}</h1>
      <div className="flex flex-wrap justify-between gap-3">
        <SegmentedLinks
          label="Saves"
          links={[
            { label: "Shared saves", to: `/saves${search}`, active: path === "/saves" },
            { label: "Kept saves", to: `/saves/kept${search}`, active: path === "/saves/kept" },
          ]}
        />
        <SegmentedLinks
          label="Game"
          links={GAMES.map((x) => ({
            label: x.label,
            to: path + x.search,
            active: x.game === game,
          }))}
        />
      </div>
    </header>
  );
}
