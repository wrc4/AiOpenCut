"use client";

import { ChevronLeft, Folder, FolderOpen, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useConfigStore } from "@/stores/config-store";

export default function ConfigPage() {
  const {
    libraryRootFolder,
    setLibraryRootFolder,
    clearLibraryRootFolder,
    resetAllSettings,
  } = useConfigStore();

  const [tempRootFolder, setTempRootFolder] = useState(libraryRootFolder || "");
  const [hasChanges, setHasChanges] = useState(false);

  const handleFolderChange = useCallback((value: string) => {
    setTempRootFolder(value);
    setHasChanges(true);
  }, []);

  const handleSaveSettings = useCallback(() => {
    try {
      setLibraryRootFolder(tempRootFolder.trim() || null);
      setHasChanges(false);
      toast.success("Settings saved", {
        description: "Your configuration has been updated successfully.",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Error saving settings", {
        description: "Failed to save settings. Please try again.",
      });
    }
  }, [tempRootFolder, setLibraryRootFolder]);

  const handleClearFolder = useCallback(() => {
    setTempRootFolder("");
    setHasChanges(true);
  }, []);

  const handleResetAll = useCallback(() => {
    resetAllSettings();
    setTempRootFolder("");
    setHasChanges(false);
    toast.success("Settings reset", {
      description: "All settings have been reset to their default values.",
    });
  }, [resetAllSettings]);

  const handleBrowseFolder = useCallback(async () => {
    // For now, we'll use a simple prompt. In a future enhancement,
    // this could open a native file picker using the File System Access API
    const folderPath = prompt(
      "Enter the path to your library folder:",
      tempRootFolder || "/Users/username/Library"
    );
    if (folderPath !== null) {
      handleFolderChange(folderPath);
    }
  }, [tempRootFolder, handleFolderChange]);

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

        {hasChanges && (
          <Button onClick={handleSaveSettings} size="sm" className="gap-2">
            <Save className="size-4!" />
            Save Changes
          </Button>
        )}
      </div>

      <main className="max-w-4xl mx-auto px-6 pt-6 pb-6">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Configure your OpenCut application settings
          </p>
        </div>

        <div className="space-y-6">
          {/* Library Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="size-5!" />
                Library Settings
              </CardTitle>
              <CardDescription>
                Configure where your media library is stored
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="library-root-folder">Library Root Folder</Label>
                <div className="flex gap-2">
                  <Input
                    id="library-root-folder"
                    placeholder="Enter folder path or leave empty for default"
                    value={tempRootFolder}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBrowseFolder}
                  >
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This folder will be used as the default location for your
                  media library. Leave empty to use the system default location.
                </p>
              </div>

              {tempRootFolder && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                  <FolderOpen className="size-4!" />
                  <span className="truncate">{tempRootFolder}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFolder}
                    className="ml-auto"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                App-wide settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Reset All Settings</Label>
                    <p className="text-sm text-muted-foreground">
                      Reset all settings to their default values
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetAll}
                    className="gap-2"
                  >
                    <RotateCcw className="size-4!" />
                    Reset All
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base">Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    Your settings are automatically saved locally in your
                    browser
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    Changes to the library folder will affect where new media is
                    stored
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    Use the "Save Changes" button to apply your modifications
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
