import { create } from "zustand";
import {
  libraryService,
  LibraryData,
  LibraryItem,
  LibraryFolder,
} from "@/lib/library-service";

interface LibraryStore {
  libraryData: LibraryData | null;
  isLoading: boolean;
  isInitialized: boolean;
  selectedItems: Set<string>;
  isSelectionMode: boolean;
  viewMode: "grid" | "list";
  sortOption: string;
  searchQuery: string;

  // Actions
  initializeLibrary: () => Promise<void>;
  loadLibraryData: () => Promise<void>;
  addFolder: (folder: LibraryFolder) => Promise<void>;
  removeFolder: (folderId: string) => Promise<void>;
  addItem: (item: LibraryItem) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateSettings: (settings: Partial<LibraryData["settings"]>) => Promise<void>;
  setSelectedItems: (items: Set<string>) => void;
  setSelectionMode: (mode: boolean) => void;
  setViewMode: (mode: "grid" | "list") => void;
  setSortOption: (option: string) => void;
  setSearchQuery: (query: string) => void;
  clearSelection: () => void;
  getFilteredAndSortedItems: () => LibraryItem[];
  getLibraryStats: () => Promise<{
    totalItems: number;
    totalFolders: number;
    videoCount: number;
    imageCount: number;
    audioCount: number;
    totalSize: number;
  }>;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  libraryData: null,
  isLoading: false,
  isInitialized: false,
  selectedItems: new Set(),
  isSelectionMode: false,
  viewMode: "grid",
  sortOption: "name-asc",
  searchQuery: "",

  initializeLibrary: async () => {
    set({ isLoading: true });
    try {
      const data = await libraryService.initializeLibrary();
      set({ libraryData: data, isInitialized: true });
    } catch (error) {
      console.error("Failed to initialize library:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadLibraryData: async () => {
    set({ isLoading: true });
    try {
      const data = await libraryService.getLibraryData();
      set({ libraryData: data, isInitialized: true });
    } catch (error) {
      console.error("Failed to load library data:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addFolder: async (folder: LibraryFolder) => {
    try {
      await libraryService.addFolder(folder);
      await get().loadLibraryData();
    } catch (error) {
      console.error("Failed to add folder:", error);
      throw error;
    }
  },

  removeFolder: async (folderId: string) => {
    try {
      await libraryService.removeFolder(folderId);
      await get().loadLibraryData();
    } catch (error) {
      console.error("Failed to remove folder:", error);
      throw error;
    }
  },

  addItem: async (item: LibraryItem) => {
    try {
      await libraryService.addItem(item);
      await get().loadLibraryData();
    } catch (error) {
      console.error("Failed to add item:", error);
      throw error;
    }
  },

  removeItem: async (itemId: string) => {
    try {
      await libraryService.removeItem(itemId);
      await get().loadLibraryData();
    } catch (error) {
      console.error("Failed to remove item:", error);
      throw error;
    }
  },

  updateSettings: async (settings: Partial<LibraryData["settings"]>) => {
    try {
      await libraryService.updateSettings(settings);
      await get().loadLibraryData();
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  },

  setSelectedItems: (items: Set<string>) => set({ selectedItems: items }),

  setSelectionMode: (mode: boolean) => set({ isSelectionMode: mode }),

  setViewMode: (mode: "grid" | "list") => set({ viewMode: mode }),

  setSortOption: (option: string) => set({ sortOption: option }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  clearSelection: () =>
    set({ selectedItems: new Set(), isSelectionMode: false }),

  getFilteredAndSortedItems: () => {
    const { libraryData, searchQuery, sortOption } = get();
    if (!libraryData) return [];

    const filtered = libraryData.items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort items
    filtered.sort((a, b) => {
      const [sortBy, order] = sortOption.split("-");
      const multiplier = order === "asc" ? 1 : -1;

      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * multiplier;
        case "date":
          return (
            (new Date(a.lastModified || 0).getTime() -
              new Date(b.lastModified || 0).getTime()) *
            multiplier
          );
        case "size":
          return ((a.size || 0) - (b.size || 0)) * multiplier;
        case "type":
          return (a.type || "").localeCompare(b.type || "") * multiplier;
        default:
          return 0;
      }
    });

    return filtered;
  },

  getLibraryStats: async () => {
    try {
      return await libraryService.getLibraryStats();
    } catch (error) {
      console.error("Failed to get library stats:", error);
      return {
        totalItems: 0,
        totalFolders: 0,
        videoCount: 0,
        imageCount: 0,
        audioCount: 0,
        totalSize: 0,
      };
    }
  },
}));
