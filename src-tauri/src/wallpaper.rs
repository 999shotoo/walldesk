use base64::engine::general_purpose;
use base64::Engine as _;
use futures_util::StreamExt;
use image::io::Reader as ImageReader;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_http::reqwest;

/// Event channel used to report download progress to the frontend.
pub const DOWNLOAD_PROGRESS_EVENT: &str = "wallpaper://download-progress";

/// Emit a progress event at most once per this many bytes. Chunks arrive in
/// ~8-16KB pieces, so emitting per chunk would flood the IPC bridge.
const PROGRESS_EVENT_INTERVAL: u64 = 256 * 1024;

#[derive(Debug)]
pub struct WallpaperError(String);

impl fmt::Display for WallpaperError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<anyhow::Error> for WallpaperError {
    fn from(e: anyhow::Error) -> Self {
        WallpaperError(format!("{}", e))
    }
}

// Attempt to get the current wallpaper path using the `wallpaper` crate.
// This function is kept small and returns a human-friendly error string on failure.
pub fn current_wallpaper() -> Result<String, WallpaperError> {
    match wallpaper::get() {
        Ok(path) => Ok(path),
        Err(e) => Err(WallpaperError(format!("failed to get wallpaper: {}", e))),
    }
}

#[tauri::command]
pub async fn get_wallpaper() -> Result<String, String> {
    current_wallpaper().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct WallpaperInfo {
    pub path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub size_bytes: Option<u64>,
}

#[tauri::command]
pub async fn get_wallpaper_info() -> Result<WallpaperInfo, String> {
    let path = wallpaper::get().map_err(|e| format!("failed to get wallpaper: {}", e))?;

    // file size
    let size = std::fs::metadata(&path).ok().map(|m| m.len());

    // attempt to read image dimensions and format
    let mut width: Option<u32> = None;
    let mut height: Option<u32> = None;
    let mut format: Option<String> = None;

    if let Ok(reader) = ImageReader::open(&path) {
        if let Ok(reader) = reader.with_guessed_format() {
            if let Some(fmt) = reader.format() {
                format = Some(format!("{:?}", fmt));
            }
            if let Ok(dim) = reader.into_dimensions() {
                width = Some(dim.0);
                height = Some(dim.1);
            }
        }
    }

    Ok(WallpaperInfo {
        path,
        width,
        height,
        format,
        size_bytes: size,
    })
}

#[tauri::command]
pub async fn get_wallpaper_preview() -> Result<String, String> {
    let path = wallpaper::get().map_err(|e| format!("failed to get wallpaper: {}", e))?;

    let bytes =
        std::fs::read(&path).map_err(|e| format!("failed to read wallpaper file: {}", e))?;

    // try to guess format from bytes
    let mime = match image::guess_format(&bytes) {
        Ok(fmt) => match fmt {
            image::ImageFormat::Png => "image/png",
            image::ImageFormat::Jpeg => "image/jpeg",
            image::ImageFormat::Gif => "image/gif",
            image::ImageFormat::Bmp => "image/bmp",
            image::ImageFormat::Ico => "image/x-icon",
            image::ImageFormat::Tiff => "image/tiff",
            image::ImageFormat::WebP => "image/webp",
            _ => "application/octet-stream",
        },
        Err(_) => {
            // fallback to extension-based guess
            match std::path::Path::new(&path)
                .extension()
                .and_then(|s| s.to_str())
            {
                Some(ext) => match ext.to_lowercase().as_str() {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "gif" => "image/gif",
                    "bmp" => "image/bmp",
                    "ico" => "image/x-icon",
                    "webp" => "image/webp",
                    _ => "application/octet-stream",
                },
                None => "application/octet-stream",
            }
        }
    };

    let b64 = general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);
    Ok(data_url)
}

/// How the desktop should scale the wallpaper. Mirrors `wallpaper::Mode`, but
/// kept separate so the IPC payload is a plain lowercase string.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FitMode {
    Center,
    Crop,
    Fit,
    Span,
    Stretch,
    Tile,
}

impl From<FitMode> for wallpaper::Mode {
    fn from(mode: FitMode) -> Self {
        match mode {
            FitMode::Center => wallpaper::Mode::Center,
            FitMode::Crop => wallpaper::Mode::Crop,
            FitMode::Fit => wallpaper::Mode::Fit,
            FitMode::Span => wallpaper::Mode::Span,
            FitMode::Stretch => wallpaper::Mode::Stretch,
            FitMode::Tile => wallpaper::Mode::Tile,
        }
    }
}

/// Where a downloaded image should land.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveTarget {
    /// `Pictures/WallDesk`. Wallpapers we intend to apply live here, because the
    /// OS reads the file back on every login — a temp file would break.
    Library,
    /// The OS downloads folder, for explicit "save a copy" actions.
    Downloads,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub url: String,
    pub downloaded: u64,
    /// `None` when the server does not send a Content-Length.
    pub total: Option<u64>,
}

fn resolve_target_dir(app: &AppHandle, target: SaveTarget) -> Result<PathBuf, String> {
    let paths = app.path();
    match target {
        SaveTarget::Library => paths
            .picture_dir()
            .map(|dir| dir.join("WallDesk"))
            .map_err(|e| format!("could not locate the Pictures directory: {}", e)),
        SaveTarget::Downloads => paths
            .download_dir()
            .map_err(|e| format!("could not locate the Downloads directory: {}", e)),
    }
}

/// Reduce a caller-supplied name to a single safe filename component.
///
/// The name originates in the webview, so it is untrusted: `file_name()` drops
/// any directory traversal and the character filter removes anything that could
/// still escape the target directory or upset the filesystem.
fn sanitize_filename(raw: &str) -> String {
    let base = Path::new(raw)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("wallpaper");

    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();

    let trimmed = cleaned.trim_matches('.').to_string();
    if trimmed.is_empty() {
        "wallpaper".to_string()
    } else {
        trimmed
    }
}

/// Download `url` into the chosen directory and return the absolute path written.
#[tauri::command]
pub async fn download_wallpaper(
    app: AppHandle,
    url: String,
    filename: String,
    target: Option<SaveTarget>,
) -> Result<String, String> {
    let target = target.unwrap_or(SaveTarget::Library);
    let dir = resolve_target_dir(&app, target)?;

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create {}: {}", dir.display(), e))?;

    let destination = dir.join(sanitize_filename(&filename));

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("request to {} failed: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!("{} returned HTTP {}", url, response.status()));
    }

    let total = response.content_length();
    let mut buffer: Vec<u8> = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download of {} was interrupted: {}", url, e))?;
        downloaded += chunk.len() as u64;
        buffer.extend_from_slice(&chunk);

        if downloaded - last_emitted >= PROGRESS_EVENT_INTERVAL {
            last_emitted = downloaded;
            let _ = app.emit(
                DOWNLOAD_PROGRESS_EVENT,
                DownloadProgress {
                    url: url.clone(),
                    downloaded,
                    total,
                },
            );
        }
    }

    // Guard against saving an HTML error page (or anything else) as a wallpaper.
    if image::guess_format(&buffer).is_err() {
        return Err(format!("{} did not return a recognisable image", url));
    }

    std::fs::write(&destination, &buffer)
        .map_err(|e| format!("could not write {}: {}", destination.display(), e))?;

    let _ = app.emit(
        DOWNLOAD_PROGRESS_EVENT,
        DownloadProgress {
            url,
            downloaded,
            total: Some(downloaded),
        },
    );

    Ok(destination.to_string_lossy().into_owned())
}

/// Apply an on-disk image as the desktop wallpaper.
///
/// Kept synchronous on purpose: the `wallpaper` crate errors are
/// `Box<dyn Error>`, which is not `Send`, so holding one across an `.await`
/// would make the command's future non-`Send`.
fn apply_wallpaper(path: &str, mode: Option<FitMode>) -> Result<(), String> {
    if !Path::new(path).is_file() {
        return Err(format!("there is no file at {}", path));
    }

    wallpaper::set_from_path(path).map_err(|e| format!("could not set the wallpaper: {}", e))?;

    if let Some(mode) = mode {
        // `set_mode` re-applies whatever the current wallpaper is, so it has to
        // run after `set_from_path`, not before.
        wallpaper::set_mode(mode.into())
            .map_err(|e| format!("could not set the wallpaper fit mode: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_wallpaper(path: String, mode: Option<FitMode>) -> Result<(), String> {
    apply_wallpaper(&path, mode)
}

/// Download `url` into the wallpaper library, then apply it. Returns the saved path.
#[tauri::command]
pub async fn download_and_set_wallpaper(
    app: AppHandle,
    url: String,
    filename: String,
    mode: Option<FitMode>,
) -> Result<String, String> {
    let path = download_wallpaper(app, url, filename, Some(SaveTarget::Library)).await?;
    apply_wallpaper(&path, mode)?;
    Ok(path)
}

