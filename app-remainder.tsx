    </div>
  );
}
  items: LibraryItem[];
  viewMode: string;
  isSelectionMode: boolean;
  selectedItems: Set<string>;
  handleItemSelect: (id: string, onSelect: boolean) => void;
  formatFileSize: (bytes?: number) => string;
  formatDuration: (seconds?: number) => string;
}) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {items.map((item) => (
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
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
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
  );
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
