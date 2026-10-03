import { useEffect, useEffectEvent, useId, useState } from "react";
import { cx } from "class-variance-authority";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { GameButton } from "@/components/game/Button";
import { sectionLabel } from "@/components/game/SectionTitle";
import { Tooltip } from "@/components/Tooltip";
import { formatLongDate } from "@/features/timeline/date";
import { toast } from "@/lib/toast";
import { useCampaign } from "./CampaignProvider";
import type { CampaignNav } from "./useCampaignNav";
import { saveProblemText, saveSourceText } from "./saveText";
import type { CampaignSave } from "./types";

type Direction = "previous" | "next";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

/** `[` and `]` step to the previous and the next save of the campaign. */
function useCampaignKeys(step: (direction: Direction) => void) {
  const onStep = useEffectEvent(step);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === "[") onStep("previous");
      else if (event.key === "]") onStep("next");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Step to a neighbor of the open save. Resolves to the save that could not
 * be opened, so that the caller can say why.
 */
function useStep(nav: CampaignNav, onFail: (save: CampaignSave) => void) {
  const step = async (direction: Direction) => {
    const save = direction === "previous" ? nav.previous : nav.next;
    if (save === null) return;
    if (!(await nav.open(save))) onFail(save);
  };
  useCampaignKeys(step);
  return step;
}

function stepLabel(direction: Direction, save: CampaignSave | null): string {
  if (save === null) return direction === "previous" ? "No earlier save" : "No later save";
  const which = direction === "previous" ? "Previous save" : "Next save";
  return `${which}, ${formatLongDate(save.date)}, ${saveSourceText(save).toLowerCase()}`;
}

/** Notes on files that the campaign still reads, or could not take. */
function campaignNotes(nav: CampaignNav): string[] {
  const notes: string[] = [];
  if (nav.pending > 0) {
    notes.push(`Reading ${nav.pending === 1 ? "1 file" : `${nav.pending} files`}`);
  }
  if (nav.refused > 0) {
    notes.push(
      nav.refused === 1
        ? "1 file you gave is from another campaign"
        : `${nav.refused} files you gave are from another campaign`,
    );
  }
  if (nav.truncated) {
    notes.push("Shows the latest 200 uploads");
  }
  return notes;
}

/**
 * The campaign as a section of a side panel: where the open save is among
 * the saves of its campaign, and a step to each neighbor. It shows with
 * every map mode, as the timeline does not.
 */
export function CampaignSection({ className }: { className?: string }) {
  const nav = useCampaign();
  if (nav === null) return null;
  return <CampaignSectionContent nav={nav} className={className} />;
}

function CampaignSectionContent({ nav, className }: { nav: CampaignNav; className?: string }) {
  const titleId = useId();
  const [failed, setFailed] = useState<string | null>(null);
  const step = useStep(nav, (save) => setFailed(save.key));
  const failedSave = nav.saves.find((x) => x.key === failed && x.problem !== null);
  const notes = campaignNotes(nav);

  return (
    <section aria-labelledby={titleId} className={cx("px-3.5 py-3", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={titleId} className={sectionLabel}>
          Campaign
        </h2>
        {nav.openIndex >= 0 && nav.saves.length > 1 && (
          <p className="font-game-num text-[11px] text-game-ink-500 tabular-nums">
            Save {nav.openIndex + 1} of {nav.saves.length}
          </p>
        )}
      </div>

      {nav.saves.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {(["previous", "next"] as const).map((direction) => {
            const save = direction === "previous" ? nav.previous : nav.next;
            const busy = save !== null && nav.opening === save.key;
            return (
              <GameButton
                key={direction}
                aria-label={stepLabel(direction, save)}
                aria-busy={busy || undefined}
                disabled={save === null || nav.opening !== null}
                onClick={() => void step(direction)}
                className={cx(
                  "w-full min-w-0 px-2",
                  direction === "previous" ? "justify-start" : "justify-end",
                )}
              >
                {direction === "previous" && (
                  <ChevronLeftIcon aria-hidden className="size-4 shrink-0" />
                )}
                <span className="truncate font-game-num text-[11.5px] tabular-nums">
                  {busy ? "Opening" : save ? formatLongDate(save.date) : "None"}
                </span>
                {direction === "next" && (
                  <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
                )}
              </GameButton>
            );
          })}
        </div>
      )}

      {failedSave?.problem && (
        <p role="status" className="mt-2 text-[11px] leading-[1.4] text-game-warn">
          {formatLongDate(failedSave.date)}: {saveProblemText(failedSave.problem)}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[11px] leading-[1.4] text-game-ink-500">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The campaign as a compact step control for a toolbar: a step to each
 * neighbor of the open save, and its place among the saves.
 */
export function CampaignStepper() {
  const nav = useCampaign();
  if (nav === null || nav.saves.length < 2) return null;
  return <CampaignStepperContent nav={nav} />;
}

function CampaignStepperContent({ nav }: { nav: CampaignNav }) {
  const step = useStep(nav, (save) => {
    if (save.problem !== null) {
      toast.error(`Could not open the save of ${formatLongDate(save.date)}`, {
        description: saveProblemText(save.problem),
      });
    }
  });

  return (
    <div role="group" aria-label="Campaign saves" className="flex items-center">
      {(["previous", "next"] as const).map((direction) => {
        const save = direction === "previous" ? nav.previous : nav.next;
        const label = stepLabel(direction, save);
        const button = (
          <GameButton
            variant="icon"
            aria-label={label}
            disabled={save === null || nav.opening !== null}
            onClick={() => void step(direction)}
          >
            {direction === "previous" ? (
              <ChevronLeftIcon aria-hidden className="size-4" />
            ) : (
              <ChevronRightIcon aria-hidden className="size-4" />
            )}
          </GameButton>
        );
        return (
          <span key={direction} className={direction === "next" ? "order-last" : undefined}>
            <Tooltip>
              <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
              <Tooltip.Content side="top" className="font-game-ui text-xs">
                {label}
              </Tooltip.Content>
            </Tooltip>
          </span>
        );
      })}
      <p className="px-1 font-game-num text-[11px] text-game-ink-300 tabular-nums">
        <span className="sr-only">Save </span>
        {nav.openIndex + 1}
        <span aria-hidden>/</span>
        <span className="sr-only"> of </span>
        {nav.saves.length}
      </p>
    </div>
  );
}
