import { create } from "zustand";
import type { SaveFileInfo, ScanError } from "../lib/tauri";

type SortBy = "date" | "name" | "modified";
type SortOrder = "asc" | "desc";

const GAME_PATH_STORAGE_KEY = "eu5GamePath";

function loadPersistedGamePath(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(GAME_PATH_STORAGE_KEY) ?? "";
}

function persistGamePath(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = path.trim();
  if (!trimmed) {
    window.localStorage.removeItem(GAME_PATH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(GAME_PATH_STORAGE_KEY, trimmed);
}

interface SaveListState {
  saves: SaveFileInfo[];
  errors: ScanError[];
  isScanning: boolean;
  searchQuery: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  selectedSave: SaveFileInfo | null;
  gamePath: string;
  gamePathError: string | null;

  setSaves: (saves: SaveFileInfo[], errors: ScanError[]) => void;
  setIsScanning: (isScanning: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sortBy: SortBy) => void;
  toggleSortOrder: () => void;
  setSelectedSave: (save: SaveFileInfo | null) => void;
  setGamePath: (gamePath: string) => void;
  setGamePathError: (message: string | null) => void;
  getFilteredSaves: () => SaveFileInfo[];
}

export const useSaveListStore = create<SaveListState>((set, get) => ({
  saves: [],
  errors: [],
  isScanning: false,
  searchQuery: "",
  sortBy: "modified",
  sortOrder: "desc",
  selectedSave: null,
  gamePath: loadPersistedGamePath(),
  gamePathError: null,

  setSaves: (saves, errors) => set({ saves, errors }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortOrder: () =>
    set((state) => ({
      sortOrder: state.sortOrder === "asc" ? "desc" : "asc",
    })),
  setSelectedSave: (selectedSave) => set({ selectedSave }),
  setGamePath: (gamePath) => {
    persistGamePath(gamePath);
    set({ gamePath, gamePathError: null });
  },
  setGamePathError: (gamePathError) => set({ gamePathError }),

  getFilteredSaves: () => {
    const { saves, searchQuery, sortBy, sortOrder } = get();

    // Filter by search query
    let filtered = saves;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = saves.filter(
        (save) =>
          save.playthroughName.toLowerCase().includes(query) ||
          save.date.includes(query) ||
          save.version.includes(query),
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "date":
          comparison = a.date.localeCompare(b.date);
          break;
        case "name":
          comparison = a.playthroughName.localeCompare(b.playthroughName);
          break;
        case "modified":
          comparison = a.modifiedTime - b.modifiedTime;
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  },
}));
