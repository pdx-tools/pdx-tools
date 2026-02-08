import { invoke } from "@tauri-apps/api/core";

export interface SaveFileInfo {
  filePath: string;
  version: string;
  date: string;
  playthroughName: string;
  playthroughId: string;
  fileSize: number;
  modifiedTime: number;
}

export interface ScanError {
  filePath: string;
  error: string;
}

export interface ScanResult {
  saves: SaveFileInfo[];
  errors: ScanError[];
}

export async function getDefaultSaveDirectory(): Promise<string> {
  return await invoke<string>("get_default_save_directory");
}

export async function scanSaveDirectory(
  directory: string,
): Promise<ScanResult> {
  return await invoke<ScanResult>("scan_save_directory", { directory });
}

export async function detectEu5GamePath(): Promise<string | null> {
  return await invoke<string | null>("detect_eu5_game_path");
}

export async function loadSaveForRenderer(
  savePath: string,
  gamePath: string,
): Promise<string> {
  return await invoke<string>("load_save_for_renderer", {
    savePath,
    gamePath,
  });
}

export async function sendInteractionCursorMoved(
  x: number,
  y: number,
): Promise<void> {
  return await invoke<void>("interaction_cursor_moved", { x, y });
}

export async function sendInteractionMouseButton(
  button: number,
  pressed: boolean,
): Promise<void> {
  return await invoke<void>("interaction_mouse_button", { button, pressed });
}

export async function sendInteractionMouseWheel(lines: number): Promise<void> {
  return await invoke<void>("interaction_mouse_wheel", { lines });
}

export async function sendInteractionKey(
  code: string,
  pressed: boolean,
): Promise<void> {
  return await invoke<void>("interaction_key", { code, pressed });
}
