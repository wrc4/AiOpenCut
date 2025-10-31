#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Window};
use tauri::api::process::{Command, CommandEvent};
use tauri::api::process::CommandEvent::Stdout;

#[tauri::command]
async fn run_ffmpeg(window: Window, args: Vec<String>) -> Result<String, String> {
  // Build command to run ffmpeg
  let mut cmd = Command::new("ffmpeg");
  cmd.args(args);

  // Spawn the child and subscribe to events
  let (mut rx, child) = match cmd.spawn() {
    Ok(pair) => pair,
    Err(e) => return Err(format!("failed to spawn ffmpeg: {}", e)),
  };

  // Forward ffmpeg events to the frontend via an event channel `ffmpeg-event`
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
          // emit lines to the webview
          let _ = window.emit("ffmpeg-event", line);
        }
        CommandEvent::Terminated { exit_code } => {
          let _ = window.emit("ffmpeg-event", format!("__terminated:{}", exit_code));
        }
        _ => {}
      }
    }
    // Ensure child is awaited so process resources are cleaned
    let _ = child.wait().await;
  });

  Ok("ffmpeg_spawned".into())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![run_ffmpeg])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}