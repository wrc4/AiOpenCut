/**
 * Platform detection utilities for OpenCut
 * Helps determine if we're running in a web browser or Tauri desktop app
 */

/**
 * Check if the app is running in a Tauri desktop environment
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any).__TAURI_INTERNALS__ &&
    !!(window as any).__TAURI__
  );
}

/**
 * Check if the app is running in a web browser environment
 */
export function isWeb(): boolean {
  return typeof window !== "undefined" && !isTauri();
}

/**
 * Check if File System Access API is available (web only)
 */
export function isFileSystemAccessApiAvailable(): boolean {
  return isWeb() && "showDirectoryPicker" in window;
}

/**
 * Get the current platform name
 */
export function getPlatform(): "web" | "desktop" {
  return isTauri() ? "desktop" : "web";
}

/**
 * Platform-specific error messages
 */
export function getPlatformErrorMessage(feature: string): string {
  if (isTauri()) {
    return `This feature requires desktop app updates. Please check for app updates.`;
  }
  return `This feature requires a modern browser with File System Access API support (Chrome/Edge).`;
}