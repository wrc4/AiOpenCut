/**
 * Platform detection utilities for OpenCut
 * Helps determine if we're running in a web browser or Tauri desktop app
 */

/**
 * Check if the app is running in a Tauri desktop environment
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") {
    console.log("isTauri: window is undefined (server-side)");
    return false;
  }

  const hasTauriInternals = !!(window as any).__TAURI_INTERNALS__;
  const hasTauri = !!(window as any).__TAURI__;
  const hasTauriIPC = !!(window as any).__TAURI_IPC__;

  console.log("isTauri detection:", {
    hasWindow: typeof window !== "undefined",
    hasTauriInternals,
    hasTauri,
    hasTauriIPC,
    result: hasTauriInternals || hasTauri || hasTauriIPC
  });

  // More lenient detection - any Tauri indicator should be sufficient
  return hasTauriInternals || hasTauri || hasTauriIPC;
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
export function getPlatformErrorMessage(_feature: string): string {
  if (isTauri()) {
    return `This feature requires desktop app updates. Please check for app updates.`;
  }
  return `This feature requires a modern browser with File System Access API support (Chrome/Edge).`;
}