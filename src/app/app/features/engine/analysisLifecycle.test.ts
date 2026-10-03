import { describe, expect, it, vi } from "vitest";
import { registerAnalysisTerminator, terminateCurrentAnalysis } from "./analysisLifecycle";
import type { SaveGameInput } from "./engineStore";

const save = (saveId: string): SaveGameInput => ({
  kind: "eu5",
  data: { kind: "server", saveId, name: `${saveId}.eu5`, uploaderId: null },
});

describe("terminateCurrentAnalysis", () => {
  it("ends the analysis once", () => {
    const terminate = vi.fn(() => true);
    registerAnalysisTerminator(terminate);

    terminateCurrentAnalysis(save("a"));
    terminateCurrentAnalysis(save("b"));
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledWith(save("a"));
  });

  it("keeps an analysis that continues into the next save", () => {
    const next = save("next");
    const terminate = vi.fn(
      (input: SaveGameInput | null) => input?.kind !== "eu5" || input !== next,
    );
    registerAnalysisTerminator(terminate);

    terminateCurrentAnalysis(next);
    // The analysis is still current, so a later input still ends it.
    terminateCurrentAnalysis(save("other"));
    expect(terminate).toHaveBeenCalledTimes(2);
    terminateCurrentAnalysis(save("later"));
    expect(terminate).toHaveBeenCalledTimes(2);
  });

  it("ignores the unregister of a replaced analysis", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const unregisterFirst = registerAnalysisTerminator(first);
    registerAnalysisTerminator(second);
    unregisterFirst();

    terminateCurrentAnalysis(null);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(null);
  });
});
