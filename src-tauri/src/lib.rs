mod wallpaper;
use std::sync::Mutex;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager, State};
use tokio::time::{sleep, Duration};

/// Safety net for the splash handoff. If the main window's webview never reports
/// in — a JS error, a failed asset load — show it anyway rather than leaving the
/// user staring at a splash screen forever.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);

// Create a struct we'll use to track the completion of
// setup related tasks
struct SetupState {
    frontend_task: bool,
    backend_task: bool,
    /// Guards against the watchdog and the normal path both swapping windows.
    revealed: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
            revealed: false,
        }))
        .invoke_handler(tauri::generate_handler![
            wallpaper::get_wallpaper,
            wallpaper::get_wallpaper_info,
            wallpaper::get_wallpaper_preview,
            wallpaper::download_wallpaper,
            wallpaper::set_wallpaper,
            wallpaper::download_and_set_wallpaper,
            set_complete
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn the backend setup task
            let app_handle = app.handle().clone();
            spawn(async move {
                if let Err(_) = setup(app_handle).await {
                    eprintln!("backend setup task failed");
                }
            });

            let watchdog_handle = app.handle().clone();
            spawn(async move {
                sleep(STARTUP_TIMEOUT).await;
                let state = watchdog_handle.state::<Mutex<SetupState>>();
                let stuck = match state.lock() {
                    Ok(guard) => !guard.revealed,
                    Err(_) => true,
                };
                if stuck {
                    eprintln!(
                        "startup did not complete within {:?}; revealing main window anyway",
                        STARTUP_TIMEOUT
                    );
                    reveal_main_window(&watchdog_handle);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Close the splash and show the main window. Safe to call more than once.
fn reveal_main_window(app: &AppHandle) {
    if let Some(splash_window) = app.get_webview_window("splashscreen") {
        if let Err(e) = splash_window.close() {
            eprintln!("failed to close splashscreen: {:?}", e);
        }
    }

    match app.get_webview_window("main") {
        Some(main_window) => {
            if let Err(e) = main_window.show() {
                eprintln!("failed to show main window: {:?}", e);
            }
            if let Err(e) = main_window.set_focus() {
                eprintln!("failed to focus main window: {:?}", e);
            }
        }
        None => eprintln!("main window not found"),
    }
}

// A custom task for setting the state of a setup task
#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), ()> {
    // Decide inside a short critical section, then act outside it — holding the
    // lock across the window calls is unnecessary and invites deadlocks.
    let should_reveal = {
        let mut state_lock = match state.lock() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("failed to lock setup state: {}", e);
                return Err(());
            }
        };

        match task.as_str() {
            "frontend" => state_lock.frontend_task = true,
            "backend" => state_lock.backend_task = true,
            _ => {
                eprintln!("invalid task completed: {}", task);
                return Err(());
            }
        }

        if state_lock.backend_task && state_lock.frontend_task && !state_lock.revealed {
            state_lock.revealed = true;
            true
        } else {
            false
        }
    };

    if should_reveal {
        reveal_main_window(&app);
    }

    Ok(())
}

/// Backend startup work.
///
/// This used to `sleep(3s)` to fake being busy. There is genuinely nothing
/// heavyweight to do here — the wallpaper library directory is created lazily on
/// the first download — so report ready immediately and let the frontend's own
/// readiness decide when the window appears.
async fn setup(app: AppHandle) -> Result<(), ()> {
    set_complete(
        app.clone(),
        app.state::<Mutex<SetupState>>(),
        "backend".to_string(),
    )
    .await?;
    Ok(())
}
