import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHistory } from "./store";

const mocks = vi.hoisted(() => ({ switchSnapshot: vi.fn(), setState: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("../store", () => ({
  useEu5Context: () => ({ setState: mocks.setState }),
  useEu5Engine: () => ({ trigger: { switchSnapshot: mocks.switchSnapshot } }),
}));
import { useSnapshotSwitch } from "./useSnapshotSwitch";

const unsupported = new File(["unsupported"], "unsupported.eu5");
const supported = new File(["supported"], "supported.eu5");

beforeEach(() => {
  vi.resetAllMocks();
  useHistory.setState({
    selectedHash: "active",
    switching: false,
    viewedProfiles: [],
    files: { unsupported, supported },
    failedSnapshots: {},
    switchError: null,
  });
});

describe("snapshot switching after parser failure", () => {
  it("keeps the active date and records the failed file", async () => {
    mocks.switchSnapshot.mockRejectedValue(Error("missing field morale"));
    await useSnapshotSwitch()("unsupported");
    const state = useHistory.getState();
    expect(state.selectedHash).toBe("active");
    expect(state.switching).toBe(false);
    expect(state.failedSnapshots.unsupported).toContain("missing field morale");
    expect(mocks.setState).not.toHaveBeenCalled();
  });

  it("can switch to a supported date after a failed date", async () => {
    mocks.switchSnapshot
      .mockRejectedValueOnce(Error("missing field morale"))
      .mockResolvedValueOnce({
        metadata: { date: "1338-01-01", playthroughName: "campaign", players: [], world: {} },
        viewedProfiles: [],
      });
    const choose = useSnapshotSwitch();
    await choose("unsupported");
    await choose("supported");
    const state = useHistory.getState();
    expect(state.selectedHash).toBe("supported");
    expect(state.switching).toBe(false);
    expect(state.failedSnapshots.unsupported).toContain("missing field morale");
    expect(state.switchError).toBeNull();
    expect(mocks.setState).toHaveBeenCalledOnce();
  });
});
