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
  AlertCircle,
  CheckCircle,
  Clock,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  getEnhancedLibraryService,
  LibraryItem,
  LibraryFolder,
} from "@/lib/library-service-new";
import { isFileSystemAccessApiAvailable, getPlatformErrorMessage } from "@/lib/platform-utils";

export default function EnhancedLibraryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [libraryData, setLibraryData] = useState<{
    folders: LibraryFolder[];
    items: LibraryItem[];
    settings: any;
  } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortOption, setSortOption] = useState("name-asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<{
    successful: number;
    failed: number;
    total: number;
  } | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const libraryService = getEnhancedLibraryService();

  // Initialize library on mount
  useEffect(() => {
    initializeLibrary();
  }, []);

  const initializeLibrary = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await libraryService.initializeLibrary();
      setLibraryData(data);
    } catch (error) {
      console.error("Failed to initialize library:", error);
      setError("Failed to initialize library. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  };

  // Import folder using enhanced file system
  const importFolder = async () => {
    setIsScanning(true);
    setError(null);
    setScanProgress(0);

    try {
      if (!isFileSystemAccessApiAvailable()) {
        alert(getPlatformErrorMessage("folder import"));
        return;
      }

      console.log("Starting enhanced folder import...");
      const result = await libraryService.importDirectory();
      console.log("Import completed:", result);

      // Add to library
      await libraryService.addFolder(result.directory);
      for (const file of result.files) {
        await libraryService.addItem(file);
      }

      // Generate thumbnails for videos
      let processedCount = 0;
      for (const file of result.files) {
        if (file.type === "video") {
          try {
            const thumbnail = await libraryService.generateThumbnail(file);
            if (thumbnail) {
              await libraryService.saveThumbnail(file.id, await fetch(thumbnail).then(r => r.blob()));
              // Update item with thumbnail
              await libraryService.addItem({ ...file, thumbnail });
            }
          } catch (thumbError) {
            console.warn(`Failed to generate thumbnail for ${file.name}:`, thumbError);
          }
        }
        processedCount++;
        setScanProgress((processedCount / result.files.length) * 100);
      }

      // Refresh library data
      const updatedData = await libraryService.getLibraryData();
      setLibraryData(updatedData);

      console.log(`Successfully imported ${result.files.length} files from ${result.directory.name}`);
    } catch (error) {
      console.error("Failed to import folder:", error);
      if (error instanceof Error && error.name !== "AbortError") {
        setError(`Failed to import folder: ${error.message}`);
      }
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Refresh file handles
  const refreshFileHandles = async () => {
    try {
      setIsScanning(true);
      const status = await libraryService.refreshFileHandles();
      setRefreshStatus(status);
      console.log("File handle refresh completed:", status);
    } catch (error) {
      console.error("Failed to refresh file handles:", error);
      setError("Failed to refresh file handles");
    } finally {
      setIsScanning(false);
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
  }

  // Get filtered and sorted items
  const getFilteredAndSortedItems = useCallback(() => {
    if (!libraryData) return [];

    let items = [...libraryData.items];

    // Apply search filter
    if (searchQuery) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    switch (sortOption) {
      case "name-asc":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        items.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "date-desc":
        items.sort((a, b) => {
          const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case "date-asc":
        items.sort((a, b) => {
          const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case "size-desc":
        items.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case "size-asc":
        items.sort((a, b) => (a.size || 0) - (b.size || 0));
        break;
    }

    return items;
  }, [libraryData, searchQuery, sortOption]);

  const filteredAndSortedItems = getFilteredAndSortedItems();
  const folders = libraryData?.folders || [];

  // Cleanup thumbnails on unmount
  useEffect(() => {
    return () => {
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
            onClick={refreshFileHandles}
            disabled={isLoading || isScanning}
          >
            <RefreshCw
              className={`size-4! ${isScanning ? "animate-spin" : ""}`}
            />
            Refresh Handles
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
              Enhanced Video Library
            </h1>
            <p className="text-muted-foreground">
              {filteredAndSortedItems.length} items • {folders.length} folders
              {selectedItems.size > 0 && (
                <span className="ml-2 text-primary">
                  • {selectedItems.size} selected
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
          </div>
        </div>

        {/* Progress Bar */}
        {isScanning && scanProgress > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Processing files...</span>
              <span className="text-sm text-muted-foreground">{Math.round(scanProgress)}%</span>
            </div>
            <Progress value={scanProgress} className="h-2" />
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Refresh Status */}
        {refreshStatus && (
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              File handle refresh completed: {refreshStatus.successful} accessible, {refreshStatus.failed} failed out of {refreshStatus.total} total items.
            </AlertDescription>
          </Alert>
        )}

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
        {folders.length > 0 && (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-3">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {folders.map((folder) => (
                  <EnhancedFolderCard
                    key={folder.id}
                    folder={folder}
                    onClick={() => {}}
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
              <EnhancedLibraryItemSkeleton key={index} viewMode={viewMode} />
            ))}
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <EnhancedEmptyLibrary onImport={importFolder} />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredAndSortedItems.map((item) => (
              <EnhancedLibraryItemCard
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
            {filteredAndSortedItems.map((item) => (
              <EnhancedLibraryItemList
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

interface EnhancedFolderCardProps {
  folder: LibraryFolder;
  onClick: () => void;
}

function EnhancedFolderCard({ folder, onClick }: EnhancedFolderCardProps) {
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
          {folder.fileSystemType && (
            <Badge variant="outline" className="text-xs">
              {folder.fileSystemType}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

interface EnhancedLibraryItemCardProps {
  item: LibraryItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (itemId: string, selected: boolean) => void;
  formatFileSize: (bytes?: number) => string;
  formatDuration: (seconds?: number) => string;
}

function EnhancedLibraryItemCard({
  item,
  isSelectionMode,
  isSelected,
  onSelect,
  formatFileSize,
  formatDuration,
}: EnhancedLibraryItemCardProps) {
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
          {item.fileHandleId && (
            <Badge variant="outline" className="text-xs">
              Linked
            </Badge>
          )}
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

interface EnhancedLibraryItemListProps {
  item: LibraryItem;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (itemId: string, selected: boolean) => void;
  formatFileSize: (bytes?: number) => string;
  formatDuration: (seconds?: number) => string;
}

function EnhancedLibraryItemList({
  item,
  isSelectionMode,
  isSelected,
  onSelect,
  formatFileSize,
  formatDuration,
}: EnhancedLibraryItemListProps) {
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
              {item.fileHandleId && (
                <Badge variant="outline" className="text-xs">
                  Linked
                </Badge>
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

function EnhancedLibraryItemSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
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

function EnhancedEmptyLibrary({ onImport }: { onImport: () => Promise<void> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Folder className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No library content</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Import a folder to browse your video materials, images, and audio files.
        Files are referenced without copying - they stay in their original location.
      </p>
      <Button size="lg" className="gap-2" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Import Folder
      </Button>
    </div>
  );
}

export default EnhancedLibraryPage;