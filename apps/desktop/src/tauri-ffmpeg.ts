import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export async function runFfmpeg(args: string[], onLine?: (line: string) => void) {
  // Listen for emitted events from Rust process
  const unlisten = await listen<string>('ffmpeg-event', (event) => {
    onLine?.(event.payload);
  });

  // Invoke the Rust command to spawn ffmpeg
  try {
    const res = await invoke('run_ffmpeg', { args });
    return res;
  } finally {
    // optionally unlisten after process completes, or handle termination messages
    // await unlisten(); // call this once you detect the process finished
  }
}