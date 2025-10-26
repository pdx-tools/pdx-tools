import { Sheet } from "@/components/Sheet";
import { Link } from "@/components/Link";
import { useWhatsNew } from "./useWhatsNew";
import type { UpdateSectionKey } from "./types";
import type React from "react";

const SECTION_ORDER: UpdateSectionKey[] = ["improvements", "fixes"];
const SECTION_EMOJI: Record<UpdateSectionKey, string> = {
  improvements: "✨",
  fixes: "🐛",
};

type UpdatesDrawerProps = {
  children: React.ReactNode;
};

export const WhatsNewDrawer = ({ children }: UpdatesDrawerProps) => {
  const { releases, isLoading, error } = useWhatsNew();
  return (
    <Sheet>
      <Sheet.Trigger asChild>{children}</Sheet.Trigger>
      <Sheet.Content
        side="right"
        className="flex w-full max-w-lg flex-col bg-slate-900 text-white shadow-2xl"
      >
        <Sheet.Header className="items-center justify-between border-b border-white/10 px-5 py-3">
          <Sheet.Title>What&apos;s new since your last visit</Sheet.Title>
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Body className="flex flex-col gap-6 px-5 py-4">
          {isLoading ? (
            <p className="text-sm opacity-80">Loading updates…</p>
          ) : error ? (
            <div className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              Unable to load updates. {error.message}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {releases.map((release) => (
                <article
                  key={release.release_date}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                >
                  <header className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">
                      {release.release_date}
                    </h3>
                    {release.learn_more_url ? (
                      <Link
                        href={release.learn_more_url}
                        className="text-xs underline decoration-dotted underline-offset-4"
                      >
                        Learn more
                      </Link>
                    ) : null}
                  </header>
                  {release.headline ? (
                    <p className="text-sm font-medium">{release.headline}</p>
                  ) : null}
                  {release.summary ? (
                    <p className="text-xs opacity-80">{release.summary}</p>
                  ) : null}

                  {SECTION_ORDER.map((sectionKey) => {
                    const items = release.sections[sectionKey] ?? [];
                    if (!items.length) {
                      return null;
                    }
                    return (
                      <ul key={sectionKey} className="mt-3 space-y-2 text-sm">
                        {items.map((item, index) => (
                          <li
                            key={`${release.release_date}-${sectionKey}-${index}`}
                            className="flex gap-2"
                          >
                            <span aria-hidden="true">
                              {SECTION_EMOJI[sectionKey]}
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })}

                  {release.cta?.url ? (
                    <div className="mt-3">
                      <Link
                        href={release.cta.url}
                        className="text-sm underline decoration-dotted underline-offset-4"
                      >
                        {release.cta.label}
                      </Link>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Sheet.Body>
        <Sheet.Footer className="border-t border-white/10 px-5 py-3">
          <Link
            href="/changelog"
            className="text-sm underline decoration-dotted underline-offset-4"
          >
            View full changelog
          </Link>
        </Sheet.Footer>
      </Sheet.Content>
    </Sheet>
  );
};
