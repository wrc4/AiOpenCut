/**
 * Web File System Provider
 * Implements FileSystemProvider for web browsers using File System Access API
 * Supports persistent file handles for file referencing without copying
 */

import {
  FileSystemProvider,
  FileSystemHandle,
  FileSystemFileHandle,
  FileSystemDirectoryHandle,
  FilePickerAcceptType,
} from "./file-system-abstraction";

interface SerializedFileHandle {
  type: "file";
  name: string;
  path: string;
  kind: "file";
}

interface SerializedDirectoryHandle {
  type: "directory";
  name: string;
  path: string;
  kind: "directory";
}

type SerializedHandle = SerializedFileHandle | SerializedDirectoryHandle;

export class WebFileSystemProvider implements FileSystemProvider {
  private handleCache = new Map<
    string,
    FileSystemFileHandle | FileSystemDirectoryHandle
  >();
  private permissionCache = new Map<string, boolean>();

  isAvailable(): boolean {
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  }

  async showDirectoryPicker(): Promise<FileSystemDirectoryHandle> {
    if (!this.isAvailable()) {
      throw new Error("File System Access API is not available");
    }

    try {
      const nativeHandle = await (window as any).showDirectoryPicker({
        mode: "read",
      });

      return this.wrapDirectoryHandle(nativeHandle);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("User cancelled directory selection");
      }
      throw error;
    }
  }

  async showFilePicker(options?: {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
  }): Promise<FileSystemFileHandle[]> {
    if (!this.isAvailable()) {
      throw new Error("File System Access API is not available");
    }

    try {
      const handles = await (window as any).showOpenFilePicker({
        multiple: options?.multiple ?? false,
        types: options?.types,
      });

      return handles.map((handle: any) => this.wrapFileHandle(handle));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("User cancelled file selection");
      }
      throw error;
    }
  }

  async requestPermission(handle: FileSystemHandle): Promise<boolean> {
    const cacheKey = this.getCacheKey(handle);

    // Check cache first
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    try {
      const nativeHandle = await this.getNativeHandle(handle);
      if (!nativeHandle) return false;

      const result = await nativeHandle.requestPermission({ mode: "read" });
      const granted = result === "granted";

      this.permissionCache.set(cacheKey, granted);
      return granted;
    } catch (error) {
      console.error("Error requesting permission:", error);
      return false;
    }
  }

  async queryPermission(handle: FileSystemHandle): Promise<boolean> {
    const cacheKey = this.getCacheKey(handle);

    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    try {
      const nativeHandle = await this.getNativeHandle(handle);
      if (!nativeHandle) return false;

      const result = await nativeHandle.queryPermission({ mode: "read" });
      const granted = result === "granted";

      this.permissionCache.set(cacheKey, granted);
      return granted;
    } catch (error) {
      console.error("Error querying permission:", error);
      return false;
    }
  }

  async serializeHandle(handle: FileSystemHandle): Promise<string> {
    const serialized: SerializedHandle = {
      type: handle.kind,
      name: handle.name,
      path: handle.path,
      kind: handle.kind,
    };

    return JSON.stringify(serialized);
  }

  async deserializeHandle(serialized: string): Promise<FileSystemHandle> {
    try {
      const data: SerializedHandle = JSON.parse(serialized);

      // For web, we can't truly deserialize handles - they need to be re-acquired
      // This is a limitation of the File System Access API
      // We'll return a placeholder that indicates the handle needs to be re-requested
      return {
        id: `${data.type}-${data.name}-${Date.now()}`,
        name: data.name,
        kind: data.kind,
        path: data.path,
        getFile: async () => {
          throw new Error(
            "File handle needs to be re-acquired via file picker"
          );
        },
      } as FileSystemFileHandle;
    } catch (error) {
      throw new Error(`Failed to deserialize handle: ${error}`);
    }
  }

  private wrapFileHandle(
    nativeHandle: FileSystemFileHandle
  ): FileSystemFileHandle {
    const wrapped: FileSystemFileHandle = {
      id: `file-${nativeHandle.name}-${Date.now()}`,
      name: nativeHandle.name,
      kind: "file",
      path: nativeHandle.name, // For files, path is just the name
      getFile: async () => {
        return await nativeHandle.getFile();
      },
    };

    this.handleCache.set(wrapped.id, wrapped);
    return wrapped;
  }

  private wrapDirectoryHandle(
    nativeHandle: FileSystemDirectoryHandle
  ): FileSystemDirectoryHandle {
    const wrapped: FileSystemDirectoryHandle = {
      id: `dir-${nativeHandle.name}-${Date.now()}`,
      name: nativeHandle.name,
      kind: "directory",
      path: nativeHandle.name,
      getEntries: async () => {
        const entries: FileSystemHandle[] = [];
        for await (const entry of (nativeHandle as any).entries()) {
          const [name, handle] = entry;
          if (handle.kind === "file") {
            entries.push(this.wrapFileHandle(handle));
          } else if (handle.kind === "directory") {
            entries.push(this.wrapDirectoryHandle(handle));
          }
        }
        return entries;
      },
      getFileHandle: async (name: string) => {
        const fileHandle = await (nativeHandle as any).getFileHandle(name);
        return this.wrapFileHandle(fileHandle);
      },
      getDirectoryHandle: async (name: string) => {
        const dirHandle = await (nativeHandle as any).getDirectoryHandle(name);
        return this.wrapDirectoryHandle(dirHandle);
      },
    };

    this.handleCache.set(wrapped.id, wrapped);
    return wrapped;
  }

  private getCacheKey(handle: FileSystemHandle): string {
    return `${handle.kind}-${handle.name}-${handle.path}`;
  }

  private async getNativeHandle(handle: FileSystemHandle): Promise<any> {
    return this.handleCache.get(handle.id);
  }
}

/**
 * Factory function to create Web File System Provider
 */
export function createWebFileSystemProvider(): FileSystemProvider {
  return new WebFileSystemProvider();
}
