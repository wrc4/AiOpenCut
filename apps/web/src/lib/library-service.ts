import { IndexedDBAdapter } from "./storage/indexeddb-adapter";
import { OPFSAdapter } from "./storage/opfs-adapter";

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

class LibraryService {
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
      await this.libraryAdapter.set("user-library", data);
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

  async scanFolder(folderHandle: FileSystemDirectoryHandle): Promise<{
    items: LibraryItem[];
    folders: LibraryFolder[];
  }> {
    const items: LibraryItem[] = [];
    const folders: LibraryFolder[] = [];

    try {
      const data = await this.getLibraryData();
      const supportedFormats = data.settings.supportedFormats;

      for await (const entry of folderHandle.entries()) {
        const [name, handle] = entry;

        if (handle.kind === "directory") {
          folders.push({
            id: `${folderHandle.name}/${name}`,
            name,
            path: `${folderHandle.name}/${name}`,
            itemCount: 0,
            lastScanned: new Date().toISOString(),
          });
        } else if (handle.kind === "file") {
          const ext = name.split(".").pop()?.toLowerCase();
          if (ext && supportedFormats.includes(ext)) {
            try {
              const file = await handle.getFile();
              const item = await this.processFile(
                file,
                `${folderHandle.name}/${name}`
              );
              items.push(item);
            } catch (error) {
              console.error(`Failed to process file ${name}:`, error);
            }
          }
        }
      }

      return { items, folders };
    } catch (error) {
      console.error("Failed to scan folder:", error);
      throw error;
    }
  }

  private async processFile(file: File, path: string): Promise<LibraryItem> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const type = this.getFileType(ext);

    const item: LibraryItem = {
      id: path,
      name: file.name,
      type,
      size: file.size,
      lastModified: new Date(file.lastModified).toISOString(),
    };

    // Generate thumbnails for images and videos
    if (type === "image" || type === "video") {
      try {
        const thumbnail = await this.generateThumbnail(file, type);
        if (thumbnail) {
          item.thumbnail = thumbnail;
        }

        // Get dimensions
        const dimensions = await this.getMediaDimensions(file, type);
        if (dimensions) {
          item.width = dimensions.width;
          item.height = dimensions.height;
          if (dimensions.duration) {
            item.duration = dimensions.duration;
          }
        }
      } catch (error) {
        console.error(`Failed to process ${type} file:`, error);
      }
    }

    return item;
  }

  private getFileType(ext?: string): LibraryItem["type"] {
    if (!ext) return "other";

    if (this.config.supportedVideoFormats.includes(ext)) return "video";
    if (this.config.supportedImageFormats.includes(ext)) return "image";
    if (this.config.supportedAudioFormats.includes(ext)) return "audio";
    return "other";
  }

  private async generateThumbnail(
    file: File,
    type: string
  ): Promise<string | undefined> {
    if (type === "image") {
      return URL.createObjectURL(file);
    }
    if (type === "video") {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.currentTime = 1;

        video.onloadeddata = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
            URL.revokeObjectURL(video.src);
            resolve(thumbnail);
          } else {
            URL.revokeObjectURL(video.src);
            resolve(undefined);
          }
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve(undefined);
        };
      });
    }
  }

  private async getMediaDimensions(
    file: File,
    type: string
  ): Promise<{ width: number; height: number; duration?: number } | undefined> {
    if (type === "image") {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
          const dimensions = {
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
          URL.revokeObjectURL(img.src);
          resolve(dimensions);
        };

        img.onerror = () => {
          URL.revokeObjectURL(img.src);
          resolve(undefined);
        };
      });
    }
    if (type === "video") {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);

        video.onloadedmetadata = () => {
          const dimensions = {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          };
          URL.revokeObjectURL(video.src);
          resolve(dimensions);
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve(undefined);
        };
      });
    }
  }

  async clearLibrary(): Promise<void> {
    try {
      const data = await this.getLibraryData();

      // Clean up thumbnails
      for (const item of data.items) {
        if (item.thumbnail) {
          await this.thumbnailAdapter.remove(item.id);
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

// Export singleton instance
export const libraryService = new LibraryService();
export { LibraryService };
