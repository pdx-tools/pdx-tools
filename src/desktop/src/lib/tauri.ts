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
