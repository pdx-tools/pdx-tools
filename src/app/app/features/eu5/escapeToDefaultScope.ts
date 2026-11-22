import type { AppEngine } from "./ui-engine";

/**
 * Esc takes off a focus, and then the selection, back to the default scope of
 * the save. The players are the default scope of a group's save, so there Esc
 * selects them again. With nothing selected, Esc changes nothing.
 */
export async function escapeToDefaultScope(
  engine: Pick<AppEngine, "getState" | "commands">,
  groupSave: boolean,
): Promise<void> {
  const selection = engine.getState().selectionState;
  if (!groupSave || selection == null || selection.isEmpty || selection.focusedLocation != null) {
    await engine.commands.clearFocusOrSelection();
  } else if (selection.preset !== "players") {
    await engine.commands.selectPlayers();
  }
}
