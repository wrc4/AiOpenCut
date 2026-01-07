import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConfigState {
  // Library settings
  libraryRootFolder: string | null;

  // Future settings can be added here
  // theme: 'light' | 'dark' | 'system'
  // autoSaveInterval: number
  // maxRecentProjects: number
  // etc.
}

interface ConfigActions {
  setLibraryRootFolder: (folder: string | null) => void;
  clearLibraryRootFolder: () => void;
  resetAllSettings: () => void;
}

export type ConfigStore = ConfigState & ConfigActions;

const defaultConfig: ConfigState = {
  libraryRootFolder: null,
};

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      ...defaultConfig,

      setLibraryRootFolder: (folder) => set({ libraryRootFolder: folder }),
      clearLibraryRootFolder: () => set({ libraryRootFolder: null }),
      resetAllSettings: () => set(defaultConfig),
    }),
    {
      name: "opencut-config",
      partialize: (state) => ({
        libraryRootFolder: state.libraryRootFolder,
      }),
    }
  )
);
