/**
 * File System Abstraction Layer
 * Provides unified API for web (File System Access API) and desktop (Electron) file operations
 * Designed to support file referencing without copying
 */

export interface FileHandle {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  path: string;
  lastModified?: number;
  size?: number;
}

export interface FileSystemFileHandle extends FileHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable?(): Promise<any>;
}

export interface FileSystemDirectoryHandle extends FileHandle {
  kind: 'directory';
  getEntries(): Promise<FileSystemHandle[]>;
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
}

export type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

export interface FileSystemProvider {
  /**
   * Request permission to access a file/directory
   */
  requestPermission(handle: FileSystemHandle): Promise<boolean>;

  /**
   * Check if permission is granted
   */
  queryPermission(handle: FileSystemHandle): Promise<boolean>;

  /**
   * Show directory picker (web) or native dialog (desktop)
   */
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;

  /**
   * Show file picker for multiple file types
   */
  showFilePicker(options?: {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
  }): Promise<FileSystemFileHandle[]>;

  /**
   * Get file handle from path (desktop only)
   */
  getFileHandleFromPath?(path: string): Promise<FileSystemFileHandle>;

  /**
   * Serialize handle for storage
   */
  serializeHandle(handle: FileSystemHandle): Promise<string>;

  /**
   * Deserialize handle from storage
   */
  deserializeHandle(serialized: string): Promise<FileSystemHandle>;

  /**
   * Check if this provider is available
   */
  isAvailable(): boolean;
}

export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

/**
 * Media file type detection
 */
export function getMediaFileType(fileName: string): 'video' | 'image' | 'audio' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';

  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif'];
  const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];

  if (videoExts.includes(ext)) return 'video';
  if (imageExts.includes(ext)) return 'image';
  if (audioExts.includes(ext)) return 'audio';

  return 'other';
}

/**
 * File metadata extraction
 */
export async function extractFileMetadata(file: File): Promise<{
  size: number;
  lastModified: number;
  type: string;
}> {
  return {
    size: file.size,
    lastModified: file.lastModified,
    type: getMediaFileType(file.name)
  };
}