import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Link } from "@/components/Link";

/**
 * The title of a game hub. A visitor with a save opens it from the home
 * page, so the hub does not tell them how. It keeps one link back to that
 * page for a visitor who arrived here first.
 */
export function HubHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{title}</h1>
        <Link to="/" className="inline-flex items-center gap-1.5">
          Open a save
          <ArrowRightIcon className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {children}
    </header>
  );
}
