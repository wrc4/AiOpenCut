"use client";

import {
  ChevronLeft,
  Folder,
  FolderOpen,
  Video,
  Image as ImageIcon,
  Music,
  File,
  Search,
  ArrowDown01,
  Plus,
  RefreshCw,
  Upload,
  Grid,
  List,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLibraryStore } from "@/stores/library-store";
import { useConfigStore } from "@/stores/config-store";
import {
  libraryService,
  LibraryItem,
  LibraryFolder,
} from "@/lib/library-service";
import {
  isTauri,
  isFileSystemAccessApiAvailable,
  getPlatformErrorMessage,
} from "@/lib/platform-utils";

export default function LibraryPage() {
  const {
    libraryData,
    isLoading,
    isInitialized,
    selectedItems,
    isSelectionMode,
    viewMode,
    sortOption,
    searchQuery,
    initializeLibrary,
    loadLibraryData,
    setSelectedItems,
    setSelectionMode,
    setViewMode,
    setSortOption,
    setSearchQuery,
    clearSelection,
    getFilteredAndSortedItems,
  } = useLibraryStore();

  const { libraryRootFolder } = useConfigStore();
  const [isScanning, setIsScanning] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>("/");

  // Initialize library on mount
  useEffect(() => {
    if (!isInitialized) {
      initializeLibrary();
    }
  }, [isInitialized, initializeLibrary]);

  // Load library data when initialized
  useEffect(() => {
    if (isInitialized) {
      loadLibraryData();
    }
  }, [isInitialized, loadLibraryData]);

  // Import folder using platform-appropriate method
  const importFolder = async () => {
    console.log("=== IMPORT FOLDER BUTTON CLICKED ===");
    setIsScanning(true);
    try {
      // Debug logging for platform detection
      console.log("Platform detection results:");
      console.log("isTauri():", isTauri());
      console.log(
        "isFileSystemAccessApiAvailable():",
        isFileSystemAccessApiAvailable()
      );
      console.log("Platform utilities check complete");

      if (isTauri()) {
        console.log("Detected desktop environment, using importFolderDesktop");
        // Desktop: Use Tauri's dialog API
        await importFolderDesktop();
      } else if (isFileSystemAccessApiAvailable()) {
        console.log(
          "Detected web environment with File System Access API, using importFolderWeb"
        );
        // Web: Use File System Access API
        await importFolderWeb();
      } else {
        console.log("No supported platform detected, showing error message");
        console.log("About to call alert with error message");
        alert(getPlatformErrorMessage("folder import"));
        console.log("Alert completed");
      }
    } catch (error) {
      console.error("=== ERROR in importFolder ===", error);
      console.error("Error name:", (error as any)?.name);
      console.error("Error message:", (error as any)?.message);
      if (error instanceof Error && error.name !== "AbortError") {
        alert(`Failed to import folder: ${error.message}`);
      }
    } finally {
      console.log("=== importFolder completed ===");
      setIsScanning(false);
    }
  };

  // Desktop folder import using Tauri APIs
  const importFolderDesktop = async () => {
    try {
      console.log("=== importFolderDesktop STARTED ===");
      console.log("About to show desktop alert message");

      // For now, show a message that desktop import is coming soon
      const message =
        "Desktop folder import is coming soon! For now, please use the web version in Chrome/Edge to import folders.";
      console.log("Message content:", message);

      // Try different alert methods in case one is blocked
      try {
        alert(message);
        console.log("Standard alert() succeeded");
      } catch (alertError) {
        console.error("Standard alert() failed:", alertError);
        try {
          // Fallback: use window.alert explicitly
          window.alert(message);
          console.log("window.alert() succeeded");
        } catch (windowAlertError) {
          console.error("window.alert() also failed:", windowAlertError);
          // Last resort: log to console
          console.log("ALERT MESSAGE (console fallback):", message);
        }
      }

      console.log("=== importFolderDesktop COMPLETED ===");

      // Desktop implementation is disabled for web-only focus
      // The architecture is ready for future Electron integration
      alert(
        "Desktop import is not available. Please use the web version with Chrome/Edge."
      );
      return;

      /*
      // Full desktop implementation (disabled for web-only focus):

      // Dynamically import Tauri APIs only when in desktop environment
      try {
        const [{ open }, { homeDir }, { invoke }] = await Promise.all([
          import("@tauri-apps/api/dialog"),
          import("@tauri-apps/api/path"),
          import("@tauri-apps/api/core"),
        ]);

        // Select folder using Tauri's dialog
        const folderPath = await open({
          directory: true,
          multiple: false,
          defaultPath: await homeDir(),
        });

        if (!folderPath || Array.isArray(folderPath)) {
          return; // User cancelled or invalid selection
        }

        // Scan folder using Tauri command
        const result = await invoke("scan_folder", { path: folderPath });
      } catch (error) {
        console.error("Desktop import failed:", error);
        alert("Desktop import is not available. Please use the web version with Chrome/Edge.");
        return;
      }

      if (!result || !result.items) {
        throw new Error("No items found in folder");
      }

      // Process the desktop scan results
      const { items, folders } = await libraryService.processDesktopScan(result);

      // Add folders to library
      for (const folder of folders) {
        await useLibraryStore.getState().addFolder(folder);
      }

      // Add all items
      for (const item of items) {
        await useLibraryStore.getState().addItem(item);
      }

      // Refresh library data
      await loadLibraryData();
      */
    } catch (error) {
      console.error("Desktop folder import failed:", error);
      throw error;
    }
  };

  // Web folder import using File System Access API
  const importFolderWeb = async () => {
    try {
      const directoryHandle = await (window as any).showDirectoryPicker();

      // Scan the folder
      const { items, folders } =
        await libraryService.scanFolder(directoryHandle);

      // Add folder to library
      // Use config root folder if set, otherwise use default behavior
      const folderPath = libraryRootFolder
        ? `${libraryRootFolder}/${directoryHandle.name}`
        : `/${directoryHandle.name}`;

      const folder: LibraryFolder = {
        id: directoryHandle.name,
        name: directoryHandle.name,
        path: folderPath,
        itemCount: items.length,
        lastScanned: new Date().toISOString(),
      };

      await useLibraryStore.getState().addFolder(folder);

      // Add all items
      for (const item of items) {
        await useLibraryStore.getState().addItem(item);
      }

      // Refresh library data
      await loadLibraryData();
    } catch (error) {
      console.error("Web folder import failed:", error);
      throw error;
    }
  };

  // Handle item selection
  const handleItemSelect = (itemId: string, selected: boolean) => {
    const newSelected = new Set(selectedItems);
    if (selected) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const filteredAndSortedItems = getFilteredAndSortedItems();

  // Apply root folder filtering to items
  const rootFilteredItems = filteredAndSortedItems.filter((item) => {
    if (!libraryRootFolder) return true; // No filter if root folder not set

    // Item ID contains the full path, so check if it starts with root folder
    const itemPath = item.id;
    const normalizedRoot = libraryRootFolder.startsWith('/') ? libraryRootFolder : '/' + libraryRootFolder;
    return itemPath.startsWith(normalizedRoot) ||
           (itemPath.includes(normalizedRoot.replace(/^\//, '')) && itemPath.startsWith('/'));
  });

  // Apply root folder filtering to folders
  const rootFilteredFolders = (libraryData?.folders || []).filter((folder) => {
    if (!libraryRootFolder) return true; // No filter if root folder not set

    const normalizedRoot = libraryRootFolder.startsWith('/') ? libraryRootFolder : '/' + libraryRootFolder;
    return folder.path.startsWith(normalizedRoot) ||
           folder.path.includes(normalizedRoot.replace(/^\//, ''));
  });

  // Use filtered folders instead of original folders
  const folders = rootFilteredFolders;

  // Cleanup thumbnails on unmount
  useEffect(() => {
    return () => {
      // Cleanup any object URLs that might have been created
      if (libraryData?.items) {
        libraryData.items.forEach((item) => {
          if (item.thumbnail?.startsWith("blob:")) {
            URL.revokeObjectURL(item.thumbnail);
          }
        });
      }
    };
  }, [libraryData]);

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-6 px-6 flex items-center justify-between w-full h-16">
        <Link
          href="/"
          className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
        >
          <ChevronLeft className="size-5! shrink-0" />
          <span className="text-sm font-medium">Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLibraryData}
            disabled={isLoading || isScanning}
          >
            <RefreshCw
              className={`size-4! ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={importFolder} disabled={isScanning}>
            <Upload className="size-4!" />
            Import Folder
          </Button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pt-6 pb-6">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Video Library
            </h1>
            <p className="text-muted-foreground">
              {rootFilteredItems.length} items • {rootFilteredFolders.length} folders
              {selectedItems.size > 0 && (
                <span className="ml-2 text-primary">
                  • {selectedItems.size} selected
                </span>
              )}
              {libraryRootFolder && (
                <span className="ml-2 flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  • <span className="text-xs">🗂️</span><span className="truncate max-w-xs">
                    Root: {libraryRootFolder}
                  </span>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSelectionMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedItems(new Set());
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(!isSelectionMode)}
            >
              {isSelectionMode ? "Done" : "Select"}
            </Button>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="size-4!" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
              >
                <List className="size-4!" />
              </Button>
            </div>
            <Link href="/config">
              <Button variant="outline" size="icon" className="h-8 w-8" title="Library Settings">
                <Settings className="size-4!" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-96">
            <Input
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-0">
            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="justify-center items-center w-9 h-9"
                      >
                        <ArrowDown01
                          strokeWidth={1.5}
                          className="!size-[1.05rem]"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSortOption("name-asc")}>
                      Name A-Z
                      {sortOption === "name-asc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortOption("name-desc")}
                    >
                      Name Z-A
                      {sortOption === "name-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortOption("date-desc")}
                    >
                      Newest First
                      {sortOption === "date-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortOption("date-asc")}>
                      Oldest First
                      {sortOption === "date-asc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSortOption("size-desc")}
                    >
                      Largest First
                      {sortOption === "size-desc" && " ✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortOption("size-asc")}>
                      Smallest First
                      {sortOption === "size-asc" && " ✓"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent>
                  <p>Sort by {sortOption.split("-")[0]}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Folders Section */}
        {rootFilteredFolders.length > 0 && (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-3">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {rootFilteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onClick={() => setCurrentFolder(folder.path)}
                  />
                ))}
              </div>
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* Items Section */}
        {isLoading ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {Array.from({ length: 10 }, (_, index) => (
              <LibraryItemSkeleton key={index} viewMode={viewMode} />
            ))}
          </div>
        ) : rootFilteredItems.length === 0 ? (
          <EmptyLibrary onImport={importFolder} />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {rootFilteredItems.map((item) => (
              <LibraryItemCard
                key={item.id}
                item={item}
                isSelectionMode={isSelectionMode}
                isSelected={selectedItems.has(item.id)}
                onSelect={handleItemSelect}
                formatFileSize={formatFileSize}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {rootFilteredItems.map((item) => (
              <LibraryItemList
                key={item.id}
                item={item}
                isSelectionMode={isSelectionMode}
                isSelected={selectedItems.has(item.id)}
                onSelect={handleItemSelect}
                formatFileSize={formatFileSize}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface FolderCardProps {
  folder: LibraryFolder;
  onClick: () => void;
}

function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <Card
      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Folder className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors" />
        <div className="space-y-1">
          <h3 className="font-medium text-sm line-clamp-2">{folder.name}</h3>
          <p className="text-xs text-muted-foreground">
            {folder.itemCount} items
          </p>
        </div>
      </div>
    </Card>
  );
}

interface LibraryItemCardProps {
  item: LibraryItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (itemId: string, selected: boolean) => void;
  formatFileSize: (bytes?: number) => string;
  formatDuration: (seconds?: number) => string;
}

function LibraryItemCard({
  item,
  isSelectionMode,
  isSelected,
  onSelect,
  formatFileSize,
  formatDuration,
}: LibraryItemCardProps) {
  const getIcon = () => {
    switch (item.type) {
      case "video":
        return <Video className="h-8 w-8 text-muted-foreground" />;
      case "image":
        return <ImageIcon className="h-8 w-8 text-muted-foreground" />;
      case "audio":
        return <Music className="h-8 w-8 text-muted-foreground" />;
      default:
        return <File className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.preventDefault();
      onSelect(item.id, !isSelected);
    }
  };

  const cardContent = (
    <Card
      className={`overflow-hidden bg-background border-none p-0 transition-all ${
        isSelectionMode && isSelected ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="relative aspect-square bg-muted flex items-center justify-center">
        {isSelectionMode && (
          <div className="absolute top-3 left-3 z-10">
            <div className="w-5 h-5 rounded-full bg-background/80 backdrop-blur-xs border flex items-center justify-center">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelect(item.id, e.target.checked)}
                className="w-4 h-4"
              />
            </div>
          </div>
        )}

        {item.thumbnail ? (
          <Image
            src={item.thumbnail}
            alt={item.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            {getIcon()}
            {item.duration && (
              <Badge variant="secondary" className="text-xs">
                {formatDuration(item.duration)}
              </Badge>
            )}
          </div>
        )}
      </div>

      <CardContent className="px-0 pt-4 flex flex-col gap-2">
        <div className="space-y-1">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">
            {item.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.size && <span>{formatFileSize(item.size)}</span>}
            {item.width && item.height && (
              <span>
                {item.width}×{item.height}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return isSelectionMode ? (
    <button
      type="button"
      onClick={handleClick}
      className="block group cursor-pointer w-full text-left"
    >
      {cardContent}
    </button>
  ) : (
    <div className="block group">{cardContent}</div>
  );
}

interface LibraryItemListProps {
  item: LibraryItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (itemId: string, selected: boolean) => void;
  formatFileSize: (bytes?: number) => string;
  formatDuration: (seconds?: number) => string;
}

function LibraryItemList({
  item,
  isSelectionMode,
  isSelected,
  onSelect,
  formatFileSize,
  formatDuration,
}: LibraryItemListProps) {
  const getIcon = () => {
    switch (item.type) {
      case "video":
        return <Video className="h-5 w-5 text-muted-foreground" />;
      case "image":
        return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
      case "audio":
        return <Music className="h-5 w-5 text-muted-foreground" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        {isSelectionMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(item.id, e.target.checked)}
            className="w-4 h-4"
          />
        )}

        <div className="flex items-center gap-3 flex-1">
          {item.thumbnail ? (
            <Image
              src={item.thumbnail}
              alt={item.name}
              width={48}
              height={48}
              className="rounded object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
              {getIcon()}
            </div>
          )}

          <div className="flex-1 space-y-1">
            <h3 className="font-medium text-sm">{item.name}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {item.size && <span>{formatFileSize(item.size)}</span>}
              {item.duration && <span>{formatDuration(item.duration)}</span>}
              {item.width && item.height && (
                <span>
                  {item.width}×{item.height}
                </span>
              )}
              {item.lastModified && (
                <span>{new Date(item.lastModified).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>

        <Badge variant="secondary" className="text-xs">
          {item.type}
        </Badge>
      </div>
    </Card>
  );
}

function LibraryItemSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
  if (viewMode === "list") {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-12" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-none p-0">
      <Skeleton className="aspect-square w-full bg-muted/50" />
      <div className="px-0 pt-4 flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Card>
  );
}

function EmptyLibrary({ onImport }: { onImport: () => Promise<void> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Folder className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No library content</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Import a folder to browse your video materials, images, and audio files.
        Your content stays local and private.
      </p>
      <Button size="lg" className="gap-2" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Import Folder
      </Button>
    </div>
  );
}
