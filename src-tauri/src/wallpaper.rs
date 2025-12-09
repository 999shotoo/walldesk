use base64::engine::general_purpose;
use base64::Engine as _;
use image::io::Reader as ImageReader;
use serde::Serialize;
use std::fmt;

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
