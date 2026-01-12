import { IndexedDBAdapter } from "./storage/indexeddb-adapter";
import { OPFSAdapter } from "./storage/opfs-adapter";
import { useConfigStore } from "@/stores/config-store";

export interface LibraryItem {
  id: string;
  name: string;
  type: "folder" | "video" | "image" | "audio" | "other";
  size?: number;
  lastModified?: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, any>;
}

export interface LibraryFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
  lastScanned?: string;
}

export interface LibraryData {
  folders: LibraryFolder[];
  items: LibraryItem[];
  lastUpdated: string;
  settings: LibrarySettings;
}

export interface LibrarySettings {
  autoScanFolders: boolean;
  showHiddenFiles: boolean;
  supportedFormats: string[];
  thumbnailQuality: "low" | "medium" | "high";
}

class LibraryServiceBackend {
  private libraryAdapter: IndexedDBAdapter<LibraryData>;
  private thumbnailAdapter: OPFSAdapter;
  private config = {
    dbName: "video-editor-library",
    storeName: "library",
    version: 1,
    supportedVideoFormats: ["mp4", "webm", "ogg", "mov", "avi", "mkv"],
    supportedImageFormats: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
    supportedAudioFormats: ["mp3", "wav", "ogg", "m4a", "flac"],
  };

  constructor() {
    this.libraryAdapter = new IndexedDBAdapter<LibraryData>(
      this.config.dbName,
      this.config.storeName,
      this.config.version
    );
    this.thumbnailAdapter = new OPFSAdapter("library-thumbnails");
  }

  async initializeLibrary(): Promise<LibraryData> {
    try {
      const existingData = await this.libraryAdapter.get("user-library");
      if (existingData) {
        return existingData;
      }

      const defaultData: LibraryData = {
        folders: [],
        items: [],
        lastUpdated: new Date().toISOString(),
        settings: {
          autoScanFolders: true,
          showHiddenFiles: false,
          supportedFormats: [
            ...this.config.supportedVideoFormats,
            ...this.config.supportedImageFormats,
            ...this.config.supportedAudioFormats,
          ],
          thumbnailQuality: "medium",
        },
      };

      await this.libraryAdapter.set("user-library", defaultData);
      return defaultData;
    } catch (error) {
      console.error("Failed to initialize library:", error);
      throw error;
    }
  }

  async getLibraryData(): Promise<LibraryData> {
    try {
      const data = await this.libraryAdapter.get("user-library");
      if (!data) {
        return await this.initializeLibrary();
      }
      return data;
    } catch (error) {
      console.error("Failed to get library data:", error);
      throw error;
    }
  }

  async addFolder(folder: LibraryFolder): Promise<void> {
    try {
      const data = await this.getLibraryData();
      const existingIndex = data.folders.findIndex((f) => f.id === folder.id);

      if (existingIndex >= 0) {
        data.folders[existingIndex] = folder;
      } else {
        data.folders.push(folder);
      }

      data.lastUpdated = new Date().toISOString();

      console.log(`Storing folder: ${folder.name} (id: ${folder.id}, path: ${folder.path})`);
      console.log(`Total folders now: ${data.folders.length}`);

      await this.libraryAdapter.set("user-library", data);
      console.log(`Folder stored successfully`);
    } catch (error) {
      console.error("Failed to add folder:", error);
      throw error;
    }
  }

  async removeFolder(folderId: string): Promise<void> {
    try {
      const data = await this.getLibraryData();
      data.folders = data.folders.filter((f) => f.id !== folderId);
      data.items = data.items.filter((item) => !item.id.startsWith(folderId));
      data.lastUpdated = new Date().toISOString();

      await this.libraryAdapter.set("user-library", data);
    } catch (error) {
      console.error("Failed to remove folder:", error);
      throw error;
    }
  }

  async addItem(item: LibraryItem): Promise<void> {
    try {
      const data = await this.getLibraryData();
      const existingIndex = data.items.findIndex((i) => i.id === item.id);

      if (existingIndex >= 0) {
        data.items[existingIndex] = item;
      } else {
        data.items.push(item);
      }

      data.lastUpdated = new Date().toISOString();
      await this.libraryAdapter.set("user-library", data);
    } catch (error) {
      console.error("Failed to add item:", error);
      throw error;
    }
  }

  async removeItem(itemId: string): Promise<void> {
    try {
      const data = await this.getLibraryData();
      data.items = data.items.filter((item) => item.id !== itemId);
      data.lastUpdated = new Date().toISOString();

      await this.libraryAdapter.set("user-library", data);

      // Clean up thumbnail if exists
      await this.thumbnailAdapter.remove(itemId);
    } catch (error) {
      console.error("Failed to remove item:", error);
      throw error;
    }
  }

  async updateSettings(settings: Partial<LibrarySettings>): Promise<void> {
    try {
      const data = await this.getLibraryData();
      data.settings = { ...data.settings, ...settings };
      data.lastUpdated = new Date().toISOString();

      await this.libraryAdapter.set("user-library", data);
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  }

  async saveThumbnail(itemId: string, thumbnail: Blob): Promise<void> {
    try {
      await this.thumbnailAdapter.set(itemId, thumbnail);
    } catch (error) {
      console.error("Failed to save thumbnail:", error);
      throw error;
    }
  }

  async getThumbnail(itemId: string): Promise<string | null> {
    try {
      const thumbnailBlob = await this.thumbnailAdapter.get(itemId);
      if (!thumbnailBlob) return null;

      return URL.createObjectURL(thumbnailBlob);
    } catch (error) {
      console.error("Failed to get thumbnail:", error);
      return null;
    }
  }

  /**
   * Scan the configured root folder using the backend API
   * This avoids the need for File System Access API popup
   */
  async scanRootFolder(): Promise<{
    items: LibraryItem[];
    folders: LibraryFolder[];
  }> {
    // Get the library root folder from config and settings
    const { libraryRootFolder } = useConfigStore.getState();
    const data = await this.getLibraryData();

    if (!libraryRootFolder) {
      throw new Error("Library root folder not configured. Please set it in Settings.");
    }

    try {
      console.log("Requesting backend scan for root folder:", libraryRootFolder);

      // Call the backend API to scan the directory
      const response = await fetch("/api/library/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rootPath: libraryRootFolder,
          showHiddenFiles: data.settings.showHiddenFiles,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Provide more specific error messages based on status code
        if (response.status === 403) {
          throw new Error(`Access denied: ${errorData.error}. The library root path is not in an allowed directory.`);
        } else if (response.status === 404) {
          throw new Error(`Directory not found: ${errorData.error}. Please check the configured path.`);
        } else if (response.status === 400) {
          throw new Error(`Invalid request: ${errorData.error}`);
        }
        throw new Error(errorData.error || `Failed to scan directory (${response.status})`);
      }

      const result = await response.json();
      console.log(`Backend scan completed: ${result.folders.length} folders, ${result.items.length} items`);

      // The backend returns paths relative to the root folder
      // We need to adjust them to match our expected format
      const adjustedItems = result.items.map((item: LibraryItem) => ({
        ...item,
        id: `/${item.id.replace(/^\/+/, '')}`, // Ensure single leading slash
      }));

      const adjustedFolders = result.folders.map((folder: LibraryFolder) => ({
        ...folder,
        id: `/${folder.id.replace(/^\/+/, '')}`, // Ensure single leading slash
        path: `/${folder.path.replace(/^\/+/, '')}`, // Ensure single leading slash
      }));

      return {
        items: adjustedItems,
        folders: adjustedFolders,
      };
    } catch (error) {
      console.error("Backend scan failed:", error);
      throw error;
    }
  }

  async clearLibrary(): Promise<void> {
    try {
      const data = await this.getLibraryData();

      // Clean up thumbnails (catch errors since some items might not have OPFS storage)
      for (const item of data.items) {
        if (item.thumbnail) {
          try {
            await this.thumbnailAdapter.remove(item.id);
          } catch (thumbError) {
            console.warn(`Failed to remove thumbnail for item ${item.id}:`, thumbError);
            // Continue with other items even if this one fails
          }
        }
      }

      // Clear library data
      await this.libraryAdapter.remove("user-library");
    } catch (error) {
      console.error("Failed to clear library:", error);
      throw error;
    }
  }

  async getLibraryStats(): Promise<{
    totalItems: number;
    totalFolders: number;
    videoCount: number;
    imageCount: number;
    audioCount: number;
    totalSize: number;
  }> {
    try {
      const data = await this.getLibraryData();

      const stats = {
        totalItems: data.items.length,
        totalFolders: data.folders.length,
        videoCount: data.items.filter((item) => item.type === "video").length,
        imageCount: data.items.filter((item) => item.type === "image").length,
        audioCount: data.items.filter((item) => item.type === "audio").length,
        totalSize: data.items.reduce((sum, item) => sum + (item.size || 0), 0),
      };

      return stats;
    } catch (error) {
      console.error("Failed to get library stats:", error);
      throw error;
    }
  }
}

// Export singleton instance as libraryService for compatibility
export const libraryService = new LibraryServiceBackend();
export { LibraryServiceBackend as LibraryService };

// Re-export types with library-service names
export type { LibraryItem, LibraryFolder, LibraryData, LibrarySettings };