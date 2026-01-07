/**
 * Enhanced Library Service
 * Provides file referencing without copying using persistent file handles
 * Designed for Electron compatibility and optimized performance
 */

import { IndexedDBAdapter } from "./storage/indexeddb-adapter";
import { OPFSAdapter } from "./storage/opfs-adapter";
import {
  getFileSystemService,
  FileSystemService,
  LibraryFileItem,
  LibraryDirectory
} from "./file-system/file-system-service";
import { getVideoProcessingService, VideoProcessingOptions } from "./video/video-processing-service";

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
  // New: persistent file handle reference
  fileHandleId?: string;
  // New: original file path for reference
  originalPath?: string;
  // New: file system type (web, electron, etc.)
  fileSystemType?: 'web' | 'electron' | 'native';
}

export interface LibraryFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
  lastScanned?: string;
  // New: directory handle reference
  directoryHandleId?: string;
  // New: file system type
  fileSystemType?: 'web' | 'electron' | 'native';
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
  // New: file system settings
  fileSystemType: 'web' | 'electron' | 'native';
  persistFileHandles: boolean;
  autoRefreshHandles: boolean;
}

export interface ScanResult {
  items: LibraryItem[];
  folders: LibraryFolder[];
}

/**
 * Enhanced Library Service with file referencing
 */
class EnhancedLibraryService {
  private libraryAdapter: IndexedDBAdapter<LibraryData>;
  private thumbnailAdapter: OPFSAdapter;
  private fileSystemService: FileSystemService;
  private videoProcessingService: ReturnType<typeof getVideoProcessingService>;
  private config = {
    dbName: "video-editor-library-enhanced",
    storeName: "library",
    version: 2, // Bump version for new schema
    supportedVideoFormats: ["mp4", "webm", "ogg", "mov", "avi", "mkv"],
    supportedImageFormats: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
    supportedAudioFormats: ["mp3", "wav", "ogg", "m4a", "flac"],
    thumbnailSizes: {
      small: 64,
      medium: 128,
      large: 256
    }
  };

  constructor() {
    this.libraryAdapter = new IndexedDBAdapter<LibraryData>(
      this.config.dbName,
      this.config.storeName,
      this.config.version
    );
    this.thumbnailAdapter = new OPFSAdapter("library-thumbnails-enhanced");
    this.fileSystemService = getFileSystemService();
    this.videoProcessingService = getVideoProcessingService();
  }

  /**
   * Initialize enhanced library with new schema
   */
  async initializeLibrary(): Promise<LibraryData> {
    try {
      const existingData = await this.libraryAdapter.get("user-library");
      if (existingData) {
        // Check if we need to migrate from old schema
        if (!this.isEnhancedSchema(existingData)) {
          return await this.migrateFromOldSchema(existingData);
        }
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
          fileSystemType: 'web',
          persistFileHandles: true,
          autoRefreshHandles: true
        }
      };

      await this.libraryAdapter.set("user-library", defaultData);
      return defaultData;
    } catch (error) {
      console.error("Failed to initialize enhanced library:", error);
      throw error;
    }
  }

  /**
   * Check if data uses enhanced schema
   */
  private isEnhancedSchema(data: LibraryData): boolean {
    return !!(data.settings as any).fileSystemType;
  }

  /**
   * Migrate from old library schema to enhanced schema
   */
  private async migrateFromOldSchema(oldData: any): Promise<LibraryData> {
    console.log('Migrating from old library schema to enhanced schema...');

    const enhancedData: LibraryData = {
      folders: oldData.folders?.map((folder: any) => ({
        ...folder,
        fileSystemType: 'web',
        directoryHandleId: undefined
      })) || [],
      items: oldData.items?.map((item: any) => ({
        ...item,
        fileHandleId: undefined,
        originalPath: item.id, // Use old ID as original path
        fileSystemType: 'web'
      })) || [],
      lastUpdated: new Date().toISOString(),
      settings: {
        autoScanFolders: oldData.settings?.autoScanFolders ?? true,
        showHiddenFiles: oldData.settings?.showHiddenFiles ?? false,
        supportedFormats: oldData.settings?.supportedFormats || [
          ...this.config.supportedVideoFormats,
          ...this.config.supportedImageFormats,
          ...this.config.supportedAudioFormats,
        ],
        thumbnailQuality: oldData.settings?.thumbnailQuality || 'medium',
        fileSystemType: 'web',
        persistFileHandles: true,
        autoRefreshHandles: true
      }
    };

    await this.libraryAdapter.set("user-library", enhancedData);
    console.log('Migration completed successfully');
    return enhancedData;
  }

  /**
   * Import directory with persistent file handles
   */
  async importDirectory(): Promise<{
    directory: LibraryFolder;
    files: LibraryItem[];
  }> {
    try {
      const result = await this.fileSystemService.importDirectory();

      // Convert to library format
      const libraryDirectory: LibraryFolder = {
        id: result.directory.id,
        name: result.directory.name,
        path: result.directory.path,
        itemCount: result.files.length,
        lastScanned: new Date().toISOString(),
        directoryHandleId: result.directory.id,
        fileSystemType: 'web'
      };

      const libraryItems: LibraryItem[] = [];

      for (const file of result.files) {
        const libraryItem: LibraryItem = {
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: new Date(file.lastModified).toISOString(),
          fileHandleId: file.id,
          originalPath: file.name,
          fileSystemType: 'web'
        };

        libraryItems.push(libraryItem);
      }

      return { directory: libraryDirectory, files: libraryItems };
    } catch (error) {
      console.error("Failed to import directory:", error);
      throw error;
    }
  }

  /**
   * Generate thumbnail for library item using file handle
   */
  async generateThumbnail(item: LibraryItem): Promise<string | null> {
    if (!item.fileHandleId || item.type !== 'video') {
      return null;
    }

    try {
      const file = await this.fileSystemService.getFile(item.fileHandleId);
      if (!file) {
        console.warn(`Could not access file for item ${item.id}`);
        return null;
      }

      const options: VideoProcessingOptions = {
        generateThumbnail: {
          time: 1, // 1 second into video
          width: 128,
          height: 72,
          quality: 0.7
        }
      };

      const result = await this.videoProcessingService.processVideo(file, options);
      return result.thumbnail || null;
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${item.name}:`, error);
      return null;
    }
  }

  /**
   * Get video metadata using file handle
   */
  async getVideoMetadata(item: LibraryItem): Promise<{
    duration?: number;
    width?: number;
    height?: number;
    framerate?: number;
  } | null> {
    if (!item.fileHandleId || item.type !== 'video') {
      return null;
    }

    try {
      const file = await this.fileSystemService.getFile(item.fileHandleId);
      if (!file) {
        return null;
      }

      const options: VideoProcessingOptions = {
        getMetadata: true
      };

      const result = await this.videoProcessingService.processVideo(file, options);
      return result.metadata || null;
    } catch (error) {
      console.error(`Failed to get metadata for ${item.name}:`, error);
      return null;
    }
  }

  /**
   * Refresh file handles (check permissions and re-request if needed)
   */
  async refreshFileHandles(): Promise<{
    successful: number;
    failed: number;
    total: number;
  }> {
    const data = await this.getLibraryData();
    let successful = 0;
    let failed = 0;
    const total = data.items.length;

    for (const item of data.items) {
      if (item.fileHandleId) {
        try {
          const file = await this.fileSystemService.getFile(item.fileHandleId);
          if (file) {
            successful++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          console.warn(`Failed to refresh handle for ${item.name}:`, error);
        }
      }
    }

    return { successful, failed, total };
  }

  /**
   * Get library data
   */
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

  /**
   * Add folder to library
   */
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

  /**
   * Add item to library
   */
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

  /**
   * Remove item from library
   */
  async removeItem(itemId: string): Promise<void> {
    try {
      const data = await this.getLibraryData();
      const item = data.items.find((i) => i.id === itemId);

      if (item?.fileHandleId) {
        // Remove persistent file handle
        await this.fileSystemService.removeHandle(item.fileHandleId);
      }

      data.items = data.items.filter((item) => item.id !== itemId);
      data.lastUpdated = new Date().toISOString();

      await this.libraryAdapter.set("user-library", data);

      // Clean up thumbnail if exists
      if (item?.thumbnail) {
        await this.thumbnailAdapter.remove(itemId);
      }
    } catch (error) {
      console.error("Failed to remove item:", error);
      throw error;
    }
  }

  /**
   * Update library settings
   */
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

  /**
   * Save thumbnail for library item
   */
  async saveThumbnail(itemId: string, thumbnail: Blob): Promise<void> {
    try {
      await this.thumbnailAdapter.set(itemId, thumbnail);
    } catch (error) {
      console.error("Failed to save thumbnail:", error);
      throw error;
    }
  }

  /**
   * Get thumbnail for library item
   */
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
   * Get library statistics
   */
  async getLibraryStats(): Promise<{
    totalItems: number;
    totalFolders: number;
    videoCount: number;
    imageCount: number;
    audioCount: number;
    totalSize: number;
    itemsWithHandles: number;
    accessibleItems: number;
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
        itemsWithHandles: data.items.filter((item) => !!item.fileHandleId).length,
        accessibleItems: 0 // Will be calculated separately
      };

      return stats;
    } catch (error) {
      console.error("Failed to get library stats:", error);
      throw error;
    }
  }

  /**
   * Clear entire library
   */
  async clearLibrary(): Promise<void> {
    try {
      const data = await this.getLibraryData();

      // Clean up thumbnails
      for (const item of data.items) {
        if (item.thumbnail) {
          await this.thumbnailAdapter.remove(item.id);
        }
        if (item.fileHandleId) {
          await this.fileSystemService.removeHandle(item.fileHandleId);
        }
      }

      // Clear library data
      await this.libraryAdapter.remove("user-library");
    } catch (error) {
      console.error("Failed to clear library:", error);
      throw error;
    }
  }
}

// Enhanced singleton instance
let enhancedLibraryService: EnhancedLibraryService | null = null;

export function getEnhancedLibraryService(): EnhancedLibraryService {
  if (!enhancedLibraryService) {
    enhancedLibraryService = new EnhancedLibraryService();
  }
  return enhancedLibraryService;
}

export { EnhancedLibraryService as LibraryService }; // For backward compatibility
export { LibraryItem, LibraryFolder, LibraryData, LibrarySettings };