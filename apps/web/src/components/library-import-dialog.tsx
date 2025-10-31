"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Video, Image as ImageIcon, Music, File } from "lucide-react";
import { useLibraryStore } from "@/stores/library-store";
import { useMediaStore } from "@/stores/media-store";
import { MediaFile } from "@/types/media";
import Image from "next/image";

interface LibraryImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function LibraryImportDialog({
  isOpen,
  onOpenChange,
  onImportComplete,
}: LibraryImportDialogProps) {
  const { getFilteredAndSortedItems } = useLibraryStore();
  const { addMediaFile } = useMediaStore();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  const libraryItems = getFilteredAndSortedItems();

  const getIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const handleItemSelect = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleImport = async () => {
    if (selectedItems.size === 0) return;

    setIsImporting(true);
    try {
      const itemsToImport = libraryItems.filter((item) =>
        selectedItems.has(item.id)
      );

      for (const item of itemsToImport) {
        // Convert library item to media file
        // Note: This is a simplified version - in a real implementation,
        // you'd need to fetch the actual file data
        const mediaFile: MediaFile = {
          id: item.id,
          name: item.name,
          type: item.type as "image" | "video" | "audio",
          file: new File([], item.name), // Placeholder - would need actual file
          url: item.thumbnail || "",
          width: item.width,
          height: item.height,
          duration: item.duration,
        };

        await addMediaFile(mediaFile);
      }

      onOpenChange(false);
      setSelectedItems(new Set());
      onImportComplete?.();
    } catch (error) {
      console.error("Failed to import items:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Import from Library</DialogTitle>
          <DialogDescription>
            Select items from your library to import into this project
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="space-y-2 p-1">
            {libraryItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items in your library. Go to the Library page to add some
                media files.
              </div>
            ) : (
              libraryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={(checked) =>
                      handleItemSelect(item.id, checked as boolean)
                    }
                  />

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
                        {getIcon(item.type)}
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <h4 className="font-medium text-sm">{item.name}</h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {item.size && <span>{formatFileSize(item.size)}</span>}
                        {item.width && item.height && (
                          <span>
                            {item.width}×{item.height}
                          </span>
                        )}
                        {item.duration && (
                          <span>
                            {Math.floor(item.duration / 60)}:
                            {Math.floor(item.duration % 60)
                              .toString()
                              .padStart(2, "0")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Badge variant="secondary" className="text-xs">
                    {item.type}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""}{" "}
            selected
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={selectedItems.size === 0 || isImporting}
            >
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}