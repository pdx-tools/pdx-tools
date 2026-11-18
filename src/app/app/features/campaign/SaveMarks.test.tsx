import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { CampaignSave } from "./types";

const mocks = vi.hoisted(() => ({ saves: [] as CampaignSave[] }));
vi.mock("./CampaignProvider", () => ({
  useCampaignTimeline: () => ({ saves: mocks.saves, opening: null }),
}));
vi.mock("./SaveList", () => ({ SaveList: () => null }));
vi.mock("@/components/Popover", () => ({
  Popover: Object.assign(({ children }: { children: React.ReactNode }) => children, {
    Trigger: ({ children }: { children: React.ReactNode }) => children,
    Content: ({ children }: { children: React.ReactNode }) => children,
  }),
}));
import { useTimelineCampaign } from "./SaveMarks";

const start = { year: 1360, month: 1, day: 1 };
const save = (key: string, day = 1): CampaignSave => ({
  key,
  name: `${key}.eu5`,
  date: { ...start, day },
  isOpen: false,
  source: { kind: "local", entryId: key, uploadedBy: null },
  membership: "same",
  problem: null,
});
function Track({
  ready,
  analyzing = new Set(),
  failed = new Set(),
}: {
  ready?: Set<string>;
  analyzing?: Set<string>;
  failed?: Set<string>;
}) {
  const campaign = useTimelineCampaign(
    start,
    ready &&
      ((save) =>
        save.source.kind === "upload"
          ? undefined
          : ready.has(save.key)
            ? "ready"
            : failed.has(save.key)
              ? "failed"
              : analyzing.has(save.key)
                ? "analyzing"
                : "pending"),
  );
  return <>{campaign?.lane({ px: (day) => day, width: 100, trackY: 20, top: 30, height: 16 })}</>;
}
beforeEach(() => {
  mocks.saves = [save("first")];
});

it("shows a single pending save before analysis and changes its bookmark when ready", () => {
  const pending = renderToString(<Track ready={new Set()} />);
  const ready = renderToString(<Track ready={new Set(["first"])} />);
  expect(pending).toContain('data-analysis="pending"');
  expect(pending).toContain("Waiting for analysis");
  expect(ready).toContain('data-analysis="ready"');
  expect(ready).toContain("fill-game-ink-300");
});

it("reports every status in a grouped bookmark", () => {
  mocks.saves = [save("first"), save("second", 2), save("third", 3)];
  const partial = renderToString(
    <Track ready={new Set(["first"])} analyzing={new Set(["second"])} />,
  );
  expect(partial).toContain('data-analysis="analyzing"');
  expect(partial).toContain("1 analyzed, 1 analyzing, 1 waiting");
  expect(partial).toContain("motion-safe:animate-analysis-pulse");
});

it("preserves ordinary campaign bookmarks when analytical status is not requested", () => {
  expect(renderToString(<Track />)).toBe("");
  mocks.saves.push(save("second", 2));
  const normal = renderToString(<Track />);
  expect(normal).not.toContain("data-analysis");
  expect(normal).not.toContain("Analysis ready");
  expect(normal).toContain("fill-game-ink-300");
});

it("keeps waiting saves hollow and active saves pulsing", () => {
  const active = renderToString(<Track ready={new Set()} analyzing={new Set(["first"])} />);
  expect(active).toContain('data-analysis="analyzing"');
  expect(active).toContain("Analyzing save");
  expect(active).toContain("motion-safe:animate-analysis-pulse");
  mocks.saves.push(save("second", 2));
  const mixed = renderToString(<Track ready={new Set(["first"])} />);
  expect(mixed).toContain('data-analysis="pending"');
  expect(mixed).toContain("1 analyzed, 1 waiting");
  expect(mixed).not.toContain("motion-safe:animate-analysis-pulse");
});

it("marks a grouped bookmark ready only when every save is analyzed", () => {
  mocks.saves = [save("first"), save("second", 2)];
  const html = renderToString(<Track ready={new Set(["first", "second"])} />);
  expect(html).toContain('data-analysis="ready"');
  expect(html).toContain("2 analyzed");
  expect(html).toContain("fill-game-ink-300");
  expect(html).not.toContain("motion-safe:animate-analysis-pulse");
});

it("keeps failed saves visible in red, including mixed clusters", () => {
  const single = renderToString(<Track ready={new Set()} failed={new Set(["first"])} />);
  expect(single).toContain('data-analysis="failed"');
  expect(single).toContain("Analysis failed");
  expect(single).toContain("stroke-game-err");
  mocks.saves = [save("first"), save("second", 2), save("third", 3)];
  const mixed = renderToString(
    <Track
      ready={new Set(["first"])}
      analyzing={new Set(["second"])}
      failed={new Set(["third"])}
    />,
  );
  expect(mixed).toContain('data-analysis="failed"');
  expect(mixed).toContain("1 analyzed, 1 analyzing, 1 failed");
});

it.each(["ready", "pending", "analyzing", "failed"] as const)(
  "preserves the selected bookmark highlight for %s saves",
  (status) => {
    mocks.saves = [{ ...save("first"), isOpen: true }];
    const html = renderToString(
      <Track
        ready={new Set(status === "ready" ? ["first"] : [])}
        analyzing={new Set(status === "analyzing" ? ["first"] : [])}
        failed={new Set(status === "failed" ? ["first"] : [])}
      />,
    );
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("stroke-game-accent-300");
    expect(html).toContain(`data-analysis="${status}"`);
    if (status === "failed") expect(html).toContain("M2.5 3 L6.5 7 M6.5 3 L2.5 7");
  },
);

it("keeps uploaded saves as ordinary navigation bookmarks when analysis is enabled", () => {
  mocks.saves = [save("upload"), save("another", 20)].map((s) => ({
    ...s,
    source: { kind: "upload", saveId: s.key, uploaderId: null, userName: "" },
  }));
  const html = renderToString(<Track ready={new Set()} />);
  expect(html).not.toContain("data-analysis");
  expect(html).not.toContain("Waiting for analysis");
  expect(html).not.toContain("animate-analysis-pulse");
  expect(html).toContain("fill-game-ink-300");
});
it("does not count uploaded saves as unfinished members of a local analysis cluster", () => {
  const uploaded: CampaignSave = {
    ...save("upload", 2),
    source: { kind: "upload", saveId: "upload", uploaderId: null, userName: "" },
  };
  mocks.saves = [save("local"), uploaded];
  const html = renderToString(<Track ready={new Set(["local"])} />);
  expect(html).toContain('data-analysis="ready"');
  expect(html).not.toContain("waiting");
  expect(html).not.toContain("analyzing");
});
