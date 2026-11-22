import { describe, expect, it, vi } from "vitest";
import { escapeToDefaultScope } from "./escapeToDefaultScope";
import type { SelectionSummaryData } from "@/wasm/wasm_eu5";

function engineWith(selection: Partial<SelectionSummaryData> | null) {
  const commands = {
    clearFocusOrSelection: vi.fn(async () => {}),
    selectPlayers: vi.fn(async () => {}),
  };
  const selectionState = selection && ({ isEmpty: false, ...selection } as SelectionSummaryData);
  const engine = { getState: () => ({ selectionState }), commands };
  return { engine: engine as unknown as Parameters<typeof escapeToDefaultScope>[0], commands };
}

describe("escapeToDefaultScope", () => {
  it("clears a selection in a single player save", async () => {
    const { engine, commands } = engineWith({ preset: undefined });
    await escapeToDefaultScope(engine, false);
    expect(commands.clearFocusOrSelection).toHaveBeenCalledOnce();
    expect(commands.selectPlayers).not.toHaveBeenCalled();
  });

  it("goes back to the players in a group's save", async () => {
    const { engine, commands } = engineWith({ preset: undefined });
    await escapeToDefaultScope(engine, true);
    expect(commands.selectPlayers).toHaveBeenCalledOnce();
    expect(commands.clearFocusOrSelection).not.toHaveBeenCalled();
  });

  it("keeps the players in a group's save", async () => {
    const { engine, commands } = engineWith({ preset: "players" });
    await escapeToDefaultScope(engine, true);
    expect(commands.selectPlayers).not.toHaveBeenCalled();
    expect(commands.clearFocusOrSelection).not.toHaveBeenCalled();
  });

  it("takes off a focus before the selection in a group's save", async () => {
    const { engine, commands } = engineWith({ preset: "players", focusedLocation: 7 });
    await escapeToDefaultScope(engine, true);
    expect(commands.clearFocusOrSelection).toHaveBeenCalledOnce();
    expect(commands.selectPlayers).not.toHaveBeenCalled();
  });

  it("keeps an empty selection in a group's save", async () => {
    const { engine, commands } = engineWith({ isEmpty: true });
    await escapeToDefaultScope(engine, true);
    expect(commands.selectPlayers).not.toHaveBeenCalled();
  });
});
