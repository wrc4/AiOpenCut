use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize)]
struct FolderItem {
    id: String,
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    size: Option<u64>,
    last_modified: Option<String>,
    thumbnail: Option<String>,
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct ScanFolderResult {
    items: Vec<FolderItem>,
    folders: Vec<FolderInfo>,
}

#[derive(Serialize, Deserialize)]
struct FolderInfo {
    id: String,
    name: String,
    path: String,
    item_count: u32,
    last_scanned: String,
}

/// Scan a folder and return information about media files
#[tauri::command]
async fn scan_folder(path: String) -> Result<ScanFolderResult, String> {
    let mut items = Vec::new();
    let mut folder_info = Vec::new();

    fn is_supported_media_file(file_name: &str) -> Option<String> {
        let ext = file_name.split('.').last()?.to_lowercase();
        let supported_extensions = [
            // Video formats
            "mp4", "webm", "ogg", "mov", "avi", "mkv", "flv", "wmv", "m4v",
            // Image formats
            "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif",
            // Audio formats
            "mp3", "wav", "m4a", "flac", "aac", "wma",
        ];

        if supported_extensions.contains(&ext.as_str()) {
            Some(ext)
        } else {
            None
        }
    }

    fn get_file_type(extension: &str) -> &str {
        match extension {
            "mp4" | "webm" | "ogg" | "mov" | "avi" | "mkv" | "flv" | "wmv" | "m4v" => "video",
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "tiff" | "tif" => "image",
            "mp3" | "wav" | "ogg" | "m4a" | "flac" | "aac" | "wma" => "audio",
            _ => "other",
        }
    }

    fn scan_directory(dir_path: &Path, items: &mut Vec<FolderItem>) -> Result<(), String> {
        let entries = fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;

            if metadata.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Some(ext) = is_supported_media_file(file_name) {
                        let file_type = get_file_type(&ext);

                        let item = FolderItem {
                            id: path.to_string_lossy().to_string(),
                            name: file_name.to_string(),
                            item_type: file_type.to_string(),
                            size: Some(metadata.len()),
                            last_modified: metadata.modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| format!("{}", d.as_secs() * 1000)),
                            thumbnail: None, // Would need image processing for thumbnails
                            duration: None,  // Would need media parsing for duration
                            width: None,     // Would need image processing for dimensions
                            height: None,
                        };

                        items.push(item);
                    }
                }
            } else if metadata.is_dir() {
                // For now, we'll only scan the top-level directory
                // Recursive scanning could be added later if needed
            }
        }
        Ok(())
    }

    let folder_path = Path::new(&path);
    if !folder_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    if !folder_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Scan the directory
    scan_directory(folder_path, &mut items)?;

    // Create folder info
    let folder_name = folder_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Imported Folder")
        .to_string();

    folder_info.push(FolderInfo {
        id: path.clone(),
        name: folder_name,
        path: path.clone(),
        item_count: items.len() as u32,
        last_scanned: chrono::Utc::now().to_rfc3339(),
    });

    Ok(ScanFolderResult {
        items,
        folders: folder_info,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![scan_folder])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
