/**
 * File System Service
 * Provides unified file system operations with persistent handle support
 * Designed for file referencing without copying, with Electron compatibility
 */

import { IndexedDBAdapter } from "../storage/indexeddb-adapter";
import {
  FileSystemProvider,
  FileSystemHandle,
  FileSystemFileHandle,
  FileSystemDirectoryHandle,
  createWebFileSystemProvider,
  getMediaFileType,
} from "./file-system-abstraction";

export interface PersistentFileHandle {
  id: string;
  name: string;
  kind: "file" | "directory";
  path: string;
  serializedHandle: string;
  lastAccessed: number;
  permissions?: {
    read: boolean;
    write?: boolean;
  };
}

export interface LibraryFileItem {
  id: string;
  handle: FileSystemFileHandle;
  name: string;
  type: "video" | "image" | "audio" | "other";
  size: number;
  lastModified: number;
  thumbnail?: string;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    codec?: string;
    bitrate?: number;
  };
}

export interface LibraryDirectory {
  id: string;
  handle: FileSystemDirectoryHandle;
  name: string;
  path: string;
  itemCount: number;
  lastScanned: number;
}

export interface FileSystemServiceConfig {
  dbName: string;
  handleStoreName: string;
  maxCachedHandles: number;
  autoCleanupInterval: number;
}

class FileSystemService {
  private provider: FileSystemProvider;
  private handleStorage: IndexedDBAdapter<PersistentFileHandle>;
  private config: FileSystemServiceConfig;
  private handleCache = new Map<string, FileSystemHandle>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config?: Partial<FileSystemServiceConfig>) {
    this.config = {
      dbName: "opencut-file-system",
      handleStoreName: "persistent-handles",
      maxCachedHandles: 1000,
      autoCleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    // Initialize provider based on environment
    this.provider = this.initializeProvider();
    this.handleStorage = new IndexedDBAdapter<PersistentFileHandle>(
      this.config.dbName,
      this.config.handleStoreName,
      1
    );

    this.startCleanupInterval();
  }

  private initializeProvider(): FileSystemProvider {
    // Web environment - File System Access API
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      return createWebFileSystemProvider();
    }

    // Future: Add Electron provider detection here
    // if (typeof window !== 'undefined' && window.electronAPI) {
    //   return createElectronFileSystemProvider();
    // }

    throw new Error("No compatible file system provider available");
  }

  /**
   * Import directory and create persistent file references
   */
  async importDirectory(): Promise<{
    directory: LibraryDirectory;
    files: LibraryFileItem[];
  }> {
    if (!this.provider.isAvailable()) {
      throw new Error("File system provider not available");
    }

    const directoryHandle = await this.provider.showDirectoryPicker();

    // Request permission for the directory
    const hasPermission =
      await this.provider.requestPermission(directoryHandle);
    if (!hasPermission) {
      throw new Error("Permission denied for directory access");
    }

    // Create library directory
    const directory: LibraryDirectory = {
      id: `dir-${directoryHandle.name}-${Date.now()}`,
      handle: directoryHandle,
      name: directoryHandle.name,
      path: directoryHandle.path,
      itemCount: 0,
      lastScanned: Date.now(),
    };

    // Scan for media files
    const files: LibraryFileItem[] = [];
    const entries = await directoryHandle.getEntries();

    for (const entry of entries) {
      if (entry.kind === "file") {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const fileType = getMediaFileType(file.name);

        if (fileType !== "other") {
          // Request permission for individual file
          await this.provider.requestPermission(fileHandle);

          // Create persistent handle
          await this.storePersistentHandle(fileHandle);

          const libraryFile: LibraryFileItem = {
            id: `file-${file.name}-${Date.now()}`,
            handle: fileHandle,
            name: file.name,
            type: fileType,
            size: file.size,
            lastModified: file.lastModified,
          };

          files.push(libraryFile);
        }
      }
    }

    directory.itemCount = files.length;

    // Store directory handle
    await this.storePersistentHandle(directoryHandle);

    return { directory, files };
  }

  /**
   * Get file from persistent handle
   */
  async getFile(fileId: string): Promise<File | null> {
    const handle = await this.getPersistentHandle(fileId);
    if (!handle || handle.kind !== "file") {
      return null;
    }

    const fileHandle = handle as FileSystemFileHandle;

    // Check permission
    const hasPermission = await this.provider.queryPermission(fileHandle);
    if (!hasPermission) {
      // Try to request permission again
      const granted = await this.provider.requestPermission(fileHandle);
      if (!granted) {
        throw new Error("Permission denied for file access");
      }
    }

    return await fileHandle.getFile();
  }

  /**
   * Store persistent file handle
   */
  private async storePersistentHandle(handle: FileSystemHandle): Promise<void> {
    const serialized = await this.provider.serializeHandle(handle);
    const persistentHandle: PersistentFileHandle = {
      id: handle.id,
      name: handle.name,
      kind: handle.kind,
      path: handle.path,
      serializedHandle: serialized,
      lastAccessed: Date.now(),
      permissions: {
        read: await this.provider.queryPermission(handle),
      },
    };

    await this.handleStorage.set(handle.id, persistentHandle);
  }

  /**
   * Get persistent handle from storage
   */
  private async getPersistentHandle(
    id: string
  ): Promise<FileSystemHandle | null> {
    // Check cache first
    if (this.handleCache.has(id)) {
      return this.handleCache.get(id)!;
    }

    // Get from storage
    const persistentHandle = await this.handleStorage.get(id);
    if (!persistentHandle) {
      return null;
    }

    try {
      const handle = await this.provider.deserializeHandle(
        persistentHandle.serializedHandle
      );
      this.handleCache.set(id, handle);

      // Update last accessed time
      persistentHandle.lastAccessed = Date.now();
      await this.handleStorage.set(id, persistentHandle);

      return handle;
    } catch (error) {
      console.error("Failed to deserialize handle:", error);
      return null;
    }
  }

  /**
   * Get all stored handles
   */
  async getAllHandles(): Promise<PersistentFileHandle[]> {
    // This would need to be implemented in IndexedDBAdapter
    // For now, return empty array
    return [];
  }

  /**
   * Remove handle from storage
   */
  async removeHandle(id: string): Promise<void> {
    this.handleCache.delete(id);
    await this.handleStorage.remove(id);
  }

  /**
   * Clean up old handles
   */
  private async cleanupOldHandles(): Promise<void> {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();

    // Get all handles and remove old ones
    const handles = await this.getAllHandles();
    const oldHandles = handles.filter(
      (handle) => now - handle.lastAccessed > maxAge
    );

    for (const handle of oldHandles) {
      await this.removeHandle(handle.id);
    }

    console.log(`Cleaned up ${oldHandles.length} old file handles`);
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupOldHandles().catch((error) => {
        console.error("Error during handle cleanup:", error);
      });
    }, this.config.autoCleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get provider instance for advanced usage
   */
  getProvider(): FileSystemProvider {
    return this.provider;
  }
}

// Singleton instance
let fileSystemService: FileSystemService | null = null;

export function getFileSystemService(): FileSystemService {
  if (!fileSystemService) {
    fileSystemService = new FileSystemService();
  }
  return fileSystemService;
}

export function createFileSystemService(
  config?: Partial<FileSystemServiceConfig>
): FileSystemService {
  return new FileSystemService(config);
}

export { FileSystemService };
