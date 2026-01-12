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
} from "@/lib/library-service-backend";
import {
  isTauri,
  isFileSystemAccessApiAvailable,
  getPlatformErrorMessage,
} from "@/lib/platform-utils";
import { toast } from "sonner";

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

  const filteredAndSortedItems = getFilteredAndSortedItems();


  // Initialize library on mount
  useEffect(() => {
    if (!isInitialized) {
      console.log("Initializing library...");
      initializeLibrary();
    }
  }, [isInitialized, initializeLibrary]);

  // Load library data when initialized
  useEffect(() => {
    if (isInitialized) {
      console.log("Loading library data... isLoading:", isLoading);
      loadLibraryData();
    }
  }, [isInitialized, loadLibraryData]);

  // Debug current state (without circular dependencies)
  useEffect(() => {
    console.log("=== LIBRARY STATE DEBUG ===");
    console.log("isInitialized:", isInitialized);
    console.log("isLoading:", isLoading);
    console.log("isScanning:", isScanning);
    console.log("searchQuery:", '"' + searchQuery + '"');
    console.log("libraryData exists:", !!libraryData);
    console.log("libraryData.items:", libraryData?.items?.length || 0);
    console.log("libraryData.folders:", libraryData?.folders?.length || 0);
    console.log("libraryRootFolder:", '"' + libraryRootFolder + '"');
    console.log("currentFolder:", '"' + currentFolder + '"');
    console.log("rootFilteredItems.length:", rootFilteredItems.length || 0);
    console.log("rootFilteredFolders.length:", rootFilteredFolders.length || 0);
    console.log("currentFilteredItems.length:", currentFilteredItems.length || 0);
    console.log("currentFilteredFolders.length:", currentFilteredFolders.length || 0);
    if (libraryData?.folders?.length > 0) {
      console.log("libraryData.folders details:");
      libraryData.folders.forEach(f => {
        console.log(`  - ${f.name}: path="${f.path}", items=${f.itemCount}`);
      });
    }
    console.log("=== END DEBUG ===");
  }, [isInitialized, isLoading, isScanning, libraryData, searchQuery, libraryRootFolder, filteredAndSortedItems]);

  // Auto-scan folders when library data changes (debounced)
  useEffect(() => {
    console.log("Auto-scan effect triggered:", {
      isInitialized,
      hasFolders: !!(libraryData?.folders?.length > 0),
      isScanning,
      folderCount: libraryData?.folders?.length || 0
    });

    if (isInitialized && libraryData?.folders?.length > 0 && !isScanning) {
      // More intelligent scanning detection
      const scanThreshold = 8000; // 8 seconds

      const hasScannedRecently = libraryData.folders.some(f => f.lastScanned ?
        (Date.now() - new Date(f.lastScanned).getTime()) < scanThreshold : false) ||
        libraryData.items.length === 0 && libraryData.folders.length > 0;

      if (!hasScannedRecently) {
        console.log("Library should be auto-scanned...");

        // Add a small delay to indicate scanning is needed
        const timer = setTimeout(() => {
          console.log("Auto-scheduling folder scan...");
          scanExistingFolders();
        }, 500);

        return () => clearTimeout(timer);
      } else {
        console.log("Skipping auto-scan (folders recently scanned)", {
          foldersWithScan: libraryData.folders.filter(f => f.lastScanned).
            map(f => ({name: f.name, lastScanned: f.lastScanned}))
        });
      }
    } else {
      console.log("Conditions not met for auto-scan:", {
        isInitialized,
        hasFolders: !!(libraryData?.folders?.length > 0),
        isScanning
      });
    }
  }, [libraryData, isInitialized, isScanning]);

  // scan all existing folders and generate metadata
  const scanExistingFolders = async () => {
    if (!libraryData?.folders || libraryData.folders.length === 0) {
      console.log("No folders to scan");
      return;
    }

    setIsScanning(true);
    console.log("=== SCANNING EXISTING FOLDERS ===");

    try {
      // Track updates to see changes
      let foldersUpdated = 0;

      // Pre-filter items by root folder to avoid processing irrelevant items
      const relevantItems = libraryData.items.filter((item) => {
        if (!libraryRootFolder) return true;
        const normalizedRoot = libraryRootFolder.startsWith('/') ? libraryRootFolder : '/' + libraryRootFolder;
        const itemPath = item.id;
        return itemPath.startsWith(normalizedRoot) ||
               (itemPath.includes(normalizedRoot.replace(/^\//, '')) && itemPath.startsWith('/'));
      });

      console.log(`Processing ${relevantItems.length} relevant items for ${libraryData.folders.length} folders`);

      for (const folder of libraryData.folders) {
        try {
          console.log(`Checking folder: ${folder.name} at path: ${folder.path}`);

          // Find all items that belong to this folder
          // The item.id contains the full path, so we can extract the folder portion
          const folderItems = relevantItems.filter((item) => {
            // Extract the folder path from item id (remove filename portion)
            const itemPath = item.id;

            // Normalize paths for comparison
            const itemFolderPath = itemPath.substring(0, itemPath.lastIndexOf('/'));
            const normalizedFolderPath = folder.path.replace(/^\//, '');

            // Check if item is in this folder
            return itemFolderPath === normalizedFolderPath ||
                   itemFolderPath === folder.path ||
                   itemPath.startsWith(folder.path);
          });

          // Update folder only if item count changed
          const newItemCount = folderItems.length;

          if (folder.itemCount !== newItemCount) {
            console.log(`Folder '${folder.name}': item count changed from ${folder.itemCount} to ${newItemCount}`);

            // Update folder with correct metadata
            const updatedFolder: LibraryFolder = {
              ...folder,
              itemCount: newItemCount,
              lastScanned: new Date().toISOString(),
            };

            await libraryService.addFolder(updatedFolder);
            foldersUpdated++;
          } else {
            console.log(`Folder '${folder.name}': item count unchanged (${newItemCount} items)`);
            // Re-scan without updating itemCount just to show it processed
            if (folder.lastScanned) {
              const date = new Date(folder.lastScanned);
              const isOld = (Date.now() - date.getTime()) > 60000; // 1 minute old
              if (isOld) {
                const updatedFolder: LibraryFolder = {
                  ...folder,
                  lastScanned: new Date().toISOString(),
                };
                await libraryService.addFolder(updatedFolder);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to scan folder ${folder.name}:`, error);
        }
      }

      console.log(`=== FOLDER SCANNING COMPLETED === Updated ${foldersUpdated} folders`);

      if (foldersUpdated > 0) {
        // Reload the data to show updated folder counts
        // Use a debounced reload to prevent too frequent updates
        console.log("Reloading library data to show updated folder counts...");

        // Prevent immediate scan on next data load
        const currentScanTime = new Date().toISOString();

        // Small delay before reload to complete the scan
        setTimeout(() => {
          loadLibraryData();
        }, 100);

        toast.success(`Folder scan completed`, {
          description: `Updated ${foldersUpdated} folders with latest metadata.`
        });
      } else {
        console.log("No folder changes detected, skipping reload");
        toast.info("Folder scan completed", {
          description: "All folder metadata is up to date."
        });
      }
    } catch (error) {
      console.error("=== ERROR in scanExistingFolders ===", error);
      toast.error("Folder scan failed", {
        description: "Failed to scan folders. Please try again."
      });
    } finally {
      setIsScanning(false);
    }
  };

  // True refresh with root folder - scan all directories and files
  const refreshLibrary = async () => {
    // Check for root folder configuration first
    if (!libraryRootFolder) {
      console.log("No root folder configured");
      toast.info("No root folder configured", {
        description: "Set a root folder in Settings to enable refresh functionality."
      });
      return;
    }

    setIsScanning(true);
    console.log("=== STARTING ROOT FOLDER SCAN ===");
    console.log("Root folder path:", libraryRootFolder);

    try {
      // Clear existing library data before fresh scan
      await libraryService.clearLibrary();
      console.log("Cleared existing library data");

      // Use the backend API to scan the configured root folder
      // This avoids the directory picker popup
      const { items, folders } = await libraryService.scanRootFolder();
      console.log(`Found ${folders.length} folders and ${items.length} items during scan`);

      // Process folders (this will add them to the library)
      for (const folder of folders) {
        await libraryService.addFolder(folder);
      }

      // Process items (this will add them to the library)
      for (const item of items) {
        await libraryService.addItem(item);
      }

      // Reload library data to show results
      await loadLibraryData();

      const message = folders.length > 0
        ? `Discovered ${folders.length} folders and ${items.length} files`
        : "No content found";

      toast.success("Library refreshed", {
        description: message
      });

    } catch (error) {
      console.error("Library refresh failed:", error);
      toast.error("Library refresh failed", {
        description: error instanceof Error ? error.message : "Failed to refresh library. Please try again."
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Refresh a single folder using stored data (re-scan metadata without picker)
  const refreshSingleFolder = async (folder: LibraryFolder) => {
    console.log(`Starting metadata refresh for folder: ${folder.name}`);

    try {
      // Since we can't persist directory handles, we'll refresh the folder metadata
      // by re-scanning the items that belong to this folder in our library

      const allItems = libraryData?.items || [];
      const folderItems = allItems.filter(item => {
        // Find items that belong to this folder based on path
        const itemPath = item.id;
        const normalizedFolderPath = folder.path.replace(/^\//, '');
        return itemPath.includes(normalizedFolderPath) ||
               itemPath.startsWith(folder.path);
      });

      console.log(`Found ${folderItems.length} items in folder ${folder.name}`);

      // Update the folder with current item count
      const updatedFolder: LibraryFolder = {
        ...folder,
        itemCount: folderItems.length,
        lastScanned: new Date().toISOString(),
      };

      await libraryService.addFolder(updatedFolder);

      console.log(`Folder metadata refresh complete for ${folder.name}: ${folderItems.length} items`);

      // Show progress
      toast.success(`Folder refreshed`, {
        description: `${folder.name}: Updated metadata for ${folderItems.length} items`,
      });

      return folderItems.length;
    } catch (error) {
      console.error(`Folder metadata refresh failed for ${folder.name}:`, error);
      throw error;
    }
  };
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

  // Handle item selection
  const handleSetCurrentFolder = (newPath: string) => {
    console.log(`Navigating to folder: ${newPath}`);
    setCurrentFolder(newPath);
  };

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

  // Calculate if items are filtered out vs having no items
  const totalItems = libraryData?.items?.length || 0;

  // Apply root folder filtering to items (only after search filtering)
  const rootFilteredItems = filteredAndSortedItems.filter((item) => {
    if (!libraryRootFolder) return true; // No filter if root folder not set

    // For File System Access API scan results, item paths are relative to scanned directory
    // Show all items to debug the issue
    return true;
  });

  // Apply root folder filtering to folders
  const rootFilteredFolders = (libraryData?.folders || []).filter((folder) => {
    // For File System Access API folders, we need to match relative to the library root configuration
    // The folders from scanRootFolder() are relative (e.g., "/Library/content") not absolute system paths
    if (!libraryRootFolder) return true; // No filter if root folder not set

    // Since File System Access API provides relative folder structure, let's be more flexible
    // Show all folders that were scanned from the root directory
    return true; // Temporarily show all folders while we debug
  });

  // Apply current folder filtering to folders for navigation
  const currentFilteredFolders = rootFilteredFolders.filter((folder) => {
    console.log(`Filtering folder navigation: ${folder.name} at path "${folder.path}" with currentFolder="${currentFolder}"`);
    if (currentFolder === "/") {
      // At root level, show folders that are directly under the root scanned directory
      // Current folder is marked as children of the root level folder
      const folderPathParts = folder.path.split('/').filter(Boolean); // Split and remove empty parts

      // For scan results, folders were stored like "/Library/content/subfolder"
      // We want to show only direct children of the scan root
      // So we look for folders with exactly 2 path parts (Library + one child)
      return folderPathParts.length === 2; // Only show direct children of root
    } else {
      // Show folders that are inside the current folder (children)
      const currentFolderParts = currentFolder.split('/').filter(Boolean);
      const folderPathParts = folder.path.split('/').filter(Boolean);

      // Show folders that are immediate children of current folder
      return folderPathParts.length === currentFolderParts.length + 1 &&
             folderPathParts.slice(0, -1).join('/') === currentFolderParts.join('/');
    }
  });

  // Apply current folder filtering to items (this is for folder navigation)
  const currentFilteredItems = rootFilteredItems.filter((item) => {
    if (currentFolder === "/") {
      // At root level, show items that are directly in the root folder
      const itemPath = item.id;
      const libraryRoot = libraryRootFolder || '';

      // Show items that are directly under the library root folder
      const itemFolder = itemPath.substring(0, itemPath.lastIndexOf('/'));
      return itemFolder === libraryRoot || itemFolder === libraryRootFolder;
    } else {
      // Show items that are in the current folder path
      return item.id.startsWith(currentFolder);
    }
  });

  // Use the current filtered folders
  const folders = currentFilteredFolders;

  console.log(`Current filtered folders for display:`, currentFilteredFolders.map(f => ({
    name: f.name, path: f.path, itemCount: f.itemCount
  })));

  // Now effects can reference variables since they're declared above

  // Auto-scan folders when library data changes (debounced)
  useEffect(() => {
    console.log("Auto-scan effect triggered:", {
      isInitialized,
      hasFolders: !!(libraryData?.folders?.length > 0),
      isScanning,
      folderCount: libraryData?.folders?.length || 0
    });

    if (isInitialized && libraryData?.folders?.length > 0 && !isScanning) {
      // More intelligent scanning detection
      const scanThreshold = 8000; // 8 seconds

      const hasScannedRecently = libraryData.folders.some(f => f.lastScanned ?
        (Date.now() - new Date(f.lastScanned).getTime()) < scanThreshold : false) ||
        libraryData.items.length === 0 && libraryData.folders.length > 0;

      if (!hasScannedRecently) {
        console.log("Library should be auto-scanned...");

        // Add a small delay to indicate scanning is needed
        const timer = setTimeout(() => {
          console.log("Auto-scheduling folder scan...");
          scanExistingFolders();
        }, 500);

        return () => clearTimeout(timer);
      } else {
        console.log("Skipping auto-scan (folders recently scanned)", {
          foldersWithScan: libraryData.folders.filter(f => f.lastScanned).
            map(f => ({name: f.name, lastScanned: f.lastScanned}))
        });
      }
    } else {
      console.log("Conditions not met for auto-scan:", {
        isInitialized,
        hasFolders: !!(libraryData?.folders?.length > 0),
        isScanning
      });
    }
  }, [libraryData, isInitialized, isScanning]);

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
            onClick={refreshLibrary}
            disabled={isLoading || isScanning}
          >
            <RefreshCw
              className={`size-4! ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
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
              {currentFilteredItems.length} items • {currentFilteredFolders.length} folders
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

        {/* Folder Navigation Breadcrumb */}
        {currentFolder !== "/" && currentFolder && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentFolder.includes('/')) {
                  // Go back to parent folder
                  const parts = currentFolder.split('/').filter(Boolean);
                  if (parts.length > 1) {
                    const parentPath = '/' + parts.slice(0, -1).join('/');
                    setCurrentFolder(parentPath);
                  } else {
                    setCurrentFolder("/");
                  }
                } else {
                  setCurrentFolder("/");
                }
              }}
              className="gap-1 px-2"
            >
              <ChevronLeft className="size-3!" />
              Back
            </Button>
            <span>Current: {currentFolder}</span>
          </div>
        )}

        {/* Folders Section */}
        {currentFilteredFolders.length > 0 && (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-3">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {currentFilteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onClick={() => handleSetCurrentFolder(folder.path)} // Navigate to this folder
                  />
                ))}
              </div>
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* Items Section */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading library...</p>
          </div>
        ) : currentFilteredItems.length === 0 ? (
          <EmptyLibrary
            onScan={refreshLibrary}
            isScanning={isLoading || isScanning}
            hasRootFolder={!!libraryRootFolder}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {currentFilteredItems.map((item) => (
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
            {currentFilteredItems.map((item) => (
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

function EmptyLibrary({ onScan, isScanning, hasRootFolder }: {
  onScan: () => Promise<void>,
  isScanning: boolean,
  hasRootFolder: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Folder className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No library content</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        {hasRootFolder
          ? "Your library is empty. New content added to your configured root folder will appear here."
          : "Add a root folder in Settings to browse your video materials, images, and audio files."
        }{' '}
        Click Refresh to update folder metadata after configuring your library root.
      </p>
      <Button size="lg" className="gap-2" onClick={onScan} disabled={isScanning}>
        <RefreshCw className="h-4 w-4" />
        {hasRootFolder ? "Refresh Library" : "Scan Library"}
      </Button>
      {!hasRootFolder && (
        <div className="mt-4 text-center">
          <Link href="/config">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
              Configure Library
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
