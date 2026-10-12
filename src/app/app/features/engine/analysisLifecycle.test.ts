import { describe, expect, it, vi } from "vitest";
import { registerAnalysisTerminator, terminateCurrentAnalysis } from "./analysisLifecycle";
import type { AnalysisChange } from "./analysisLifecycle";
import type { SaveGameInput } from "./engineStore";

const save = (saveId: string): SaveGameInput => ({
  kind: "eu5",
  data: { kind: "server", saveId, name: `${saveId}.eu5`, uploaderId: null },
});

describe("terminateCurrentAnalysis", () => {
  it("ends the analysis once", () => {
    const terminate = vi.fn(() => true);
    registerAnalysisTerminator(terminate);

    terminateCurrentAnalysis({ from: null, to: save("a") });
    terminateCurrentAnalysis({ from: null, to: save("b") });
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledWith({ from: null, to: save("a") });
  });

  it("keeps an analysis that continues into the next save", () => {
    const next = save("next");
    const terminate = vi.fn(({ to }: AnalysisChange) => to?.kind !== "eu5" || to !== next);
    registerAnalysisTerminator(terminate);

    terminateCurrentAnalysis({ from: null, to: next });
    // The analysis is still current, so a later input still ends it.
    terminateCurrentAnalysis({ from: null, to: save("other") });
    expect(terminate).toHaveBeenCalledTimes(2);
    terminateCurrentAnalysis({ from: null, to: save("later") });
    expect(terminate).toHaveBeenCalledTimes(2);
  });

  it("ignores the unregister of a replaced analysis", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const unregisterFirst = registerAnalysisTerminator(first);
    registerAnalysisTerminator(second);
    unregisterFirst();

    terminateCurrentAnalysis({ from: null, to: null });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ from: null, to: null });
  });
});
