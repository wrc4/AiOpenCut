import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

// Supported file formats
const supportedVideoFormats = ["mp4", "webm", "ogg", "mov", "avi", "mkv"];
const supportedImageFormats = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const supportedAudioFormats = ["mp3", "wav", "ogg", "m4a", "flac"];
const supportedFormats = [...supportedVideoFormats, ...supportedImageFormats, ...supportedAudioFormats];

interface LibraryItem {
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

interface LibraryFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
  lastScanned?: string;
}

interface ScanResult {
  items: LibraryItem[];
  folders: LibraryFolder[];
}

function getFileType(ext?: string): LibraryItem["type"] {
  if (!ext) return "other";

  if (supportedVideoFormats.includes(ext)) return "video";
  if (supportedImageFormats.includes(ext)) return "image";
  if (supportedAudioFormats.includes(ext)) return "audio";
  return "other";
}

async function scanDirectory(rootPath: string, currentPath: string = "", showHiddenFiles: boolean = false): Promise<ScanResult> {
  const items: LibraryItem[] = [];
  const folders: LibraryFolder[] = [];
  const absolutePath = path.join(rootPath, currentPath);

  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const entryName = entry.name;

      // Skip hidden files/folders unless showHiddenFiles is true
      if (!showHiddenFiles && entryName.startsWith('.')) {
        continue;
      }

      const relativePath = currentPath ? path.join(currentPath, entryName) : entryName;

      if (entry.isDirectory()) {
        // Scan subdirectory
        const subResult = await scanDirectory(rootPath, relativePath, showHiddenFiles);

        // Only add top-level directories (direct children of the root)
        if (!currentPath && subResult.items.length > 0) {
          folders.push({
            id: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
            name: entryName,
            path: '/' + relativePath.replace(/\\/g, '/'), // Add leading slash
            itemCount: subResult.items.length,
            lastScanned: new Date().toISOString(),
          });
        }

        // Also add nested folders from the recursion
        folders.push(...subResult.folders);

        // Add subdirectory items
        items.push(...subResult.items);
      } else if (entry.isFile()) {
        const ext = path.extname(entryName).slice(1).toLowerCase();

        if (ext && supportedFormats.includes(ext)) {
          try {
            const fileAbsolutePath = path.join(absolutePath, entryName);
            const stats = await fs.stat(fileAbsolutePath);

            const item: LibraryItem = {
              id: '/' + relativePath.replace(/\\/g, '/'), // Normalize to forward slashes with leading slash
              name: entryName,
              type: getFileType(ext),
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            };

            items.push(item);
          } catch (error) {
            console.error(`Failed to process file ${relativePath}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan directory ${absolutePath}:`, error);
    throw error;
  }

  return { items, folders };
}

// Allowed directory patterns - can be configured via environment variables
const ALLOWED_ROOT_PATHS = process.env.LIBRARY_ALLOWED_PATHS
  ? process.env.LIBRARY_ALLOWED_PATHS.split(',')
  : ['/Users', '/home', '/Volumes', '/media'];

// Check if a path is within allowed directories
function isPathAllowed(targetPath: string): boolean {
  const normalizedPath = path.resolve(targetPath);
  return ALLOWED_ROOT_PATHS.some(allowedRoot => {
    const resolvedRoot = path.resolve(allowedRoot);
    return normalizedPath.startsWith(resolvedRoot);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    if (!body || typeof body.rootPath !== 'string' || !body.rootPath.trim()) {
      return NextResponse.json(
        { error: 'Root path is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const rootPath = body.rootPath.trim();
    const showHiddenFiles = body.showHiddenFiles === true;

    // Check if path is allowed
    if (!isPathAllowed(rootPath)) {
      return NextResponse.json(
        { error: "Access denied: Path not in allowed directories" },
        { status: 403 }
      );
    }

    // Validate the path exists and is accessible
    try {
      const stats = await fs.stat(rootPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: "Path is not a directory" },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: "Directory not found or not accessible" },
        { status: 404 }
      );
    }

    console.log(`Starting library scan for: ${rootPath} (showHiddenFiles: ${showHiddenFiles})`);
    const startTime = Date.now();

    // Scan the directory
    const { items, folders } = await scanDirectory(rootPath, "", showHiddenFiles);

    const scanTime = Date.now() - startTime;
    console.log(`Scan completed in ${scanTime}ms. Found ${folders.length} folders and ${items.length} items`);

    return NextResponse.json({
      success: true,
      items,
      folders,
      scanTime,
      rootPath,
    });
  } catch (error) {
    console.error("Library scan failed:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}