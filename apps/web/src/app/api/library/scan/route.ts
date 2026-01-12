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

async function scanDirectory(dirPath: string, basePath: string = ""): Promise<ScanResult> {
  const items: LibraryItem[] = [];
  const folders: LibraryFolder[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // Process directories first
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderName = entry.name;
        const folderPath = path.join(dirPath, folderName);
        const relativePath = path.join(basePath, folderName);

        console.log(`Scanning directory: ${folderPath}`);

        // Recursively scan subdirectory
        const subResult = await scanDirectory(folderPath, relativePath);

        // Add current folder
        folders.push({
          id: relativePath,
          name: folderName,
          path: relativePath,
          itemCount: subResult.items.length,
          lastScanned: new Date().toISOString(),
        });

        // Add subdirectory items and folders
        items.push(...subResult.items);
        folders.push(...subResult.folders);
      }
    }

    // Process files
    for (const entry of entries) {
      if (entry.isFile()) {
        const fileName = entry.name;
        const ext = path.extname(fileName).slice(1).toLowerCase();

        if (ext && supportedFormats.includes(ext)) {
          const filePath = path.join(dirPath, fileName);
          const relativePath = path.join(basePath, fileName);

          try {
            const stats = await fs.stat(filePath);

            const item: LibraryItem = {
              id: relativePath,
              name: fileName,
              type: getFileType(ext),
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            };

            // For images, we could potentially get dimensions here
            // For videos, we could get duration and dimensions
            // This would require additional video processing libraries

            items.push(item);
          } catch (error) {
            console.error(`Failed to process file ${filePath}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan directory ${dirPath}:`, error);
    throw error;
  }

  return { items, folders };
}

// Allowed directory patterns - can be configured via environment variables
// For development, we'll allow common user directories
const ALLOWED_ROOT_PATHS = process.env.LIBRARY_ALLOWED_PATHS
  ? process.env.LIBRARY_ALLOWED_PATHS.split(',')
  : ['/Users', '/home', '/Volumes', '/media'];

// Check if a path is within allowed directories
function isPathAllowed(targetPath: string): boolean {
  // Normalize path
  const normalizedPath = path.resolve(targetPath);

  // Check if path is within any allowed root
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

    console.log(`Starting library scan for: ${rootPath}`);
    const startTime = Date.now();

    // Scan the directory
    const { items, folders } = await scanDirectory(rootPath);

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