mod wallpaper;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;
use tokio::time::{sleep, Duration};

/// Safety net for the splash handoff. If the main window's webview never reports
/// in — a JS error, a failed asset load — show it anyway rather than leaving the
/// user staring at a splash screen forever.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);

/// How long the splash screen stays up once it is actually on screen.
///
/// A placeholder, and the only reason it exists is that there is nothing slow to
/// wait for yet (see `setup`): startup finishes in a few hundred milliseconds, so
/// without a floor the splash appears and vanishes as a flicker. It also reserves
/// the slot for work that will genuinely need the time — an update check is the
/// next thing to go in `setup`, and this is the budget it gets to run in for free.
///
/// Measured from the moment the window becomes visible rather than from process
/// start, because time spent building the webview is time the user spent looking
/// at nothing. Drop this to zero to hand over as soon as the app is ready.
const SPLASH_MIN_VISIBLE: Duration = Duration::from_secs(4);

// Create a struct we'll use to track the completion of
// setup related tasks
struct SetupState {
    frontend_task: bool,
    backend_task: bool,
    /// Guards against the watchdog and the normal path both swapping windows.
    revealed: bool,
    /// When the splash screen became visible, or `None` if it never did — a
    /// failed webview, or startup finishing before it had a chance to paint.
    splash_shown_at: Option<Instant>,
    /// Both tasks complete but splash hasn't painted yet — defer the handoff to
    /// splash_ready so the splash gets its minimum-visible time.
    pending_reveal: bool,
}

/// Result of the startup update check, shared with the frontend. The check runs
/// in the background during the splash; `get_update_status` waits for it to
/// settle so the main window never guesses.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateState {
    /// True once the check has settled (success, failure, or timeout).
    checked: bool,
    /// An update newer than the running build is available.
    available: bool,
    /// The version offered, when `available` is true.
    version: Option<String>,
}

/// Emitted on `update://progress` while the update downloads.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
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
            splash_shown_at: None,
            pending_reveal: false,
        }))
        .manage(Arc::new(Mutex::new(UpdateState {
            checked: false,
            available: false,
            version: None,
        })))
        .invoke_handler(tauri::generate_handler![
            wallpaper::get_wallpaper,
            wallpaper::get_wallpaper_info,
            wallpaper::get_wallpaper_preview,
            wallpaper::download_wallpaper,
            wallpaper::set_wallpaper,
            wallpaper::download_and_set_wallpaper,
            set_complete,
            splash_ready,
            get_update_status,
            check_for_update,
            install_update
        ])
        .setup(|app| {
            // The updater plugin is desktop-only; it re-exports nothing usable on
            // mobile, so keep it out of that binary.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

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
                // Claim the handoff inside the lock, so a task that reports in at
                // the same moment cannot reveal a second time.
                let stuck = match state.lock() {
                    Ok(mut guard) => {
                        let stuck = !guard.revealed;
                        guard.revealed = true;
                        stuck
                    }
                    Err(_) => true,
                };
                if stuck {
                    eprintln!(
                        "startup did not complete within {:?}; revealing main window anyway",
                        STARTUP_TIMEOUT
                    );
                    // No minimum-visible wait here on purpose: this path only runs
                    // when something is broken, and the point is to get the user
                    // into the app.
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

/// Put the splash screen on screen.
///
/// The window is created hidden (see `tauri.conf.json`) and the splash's own
/// webview calls this once it has something worth looking at. Before, the window
/// was visible from the moment it was created, which meant the first thing every
/// launch showed was an empty frame while the webview started up — the very thing
/// a splash screen is supposed to cover.
///
/// Idempotent: React runs effects twice in development, and the second call must
/// not restart the minimum-visible clock.
#[tauri::command]
async fn splash_ready(app: AppHandle, state: State<'_, Mutex<SetupState>>) -> Result<(), ()> {
    let (should_show, takeover) = {
        let mut state_lock = match state.lock() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("failed to lock setup state: {}", e);
                return Err(());
            }
        };

        // Already handed over, or already showing. Showing it now would flash a
        // window that is on its way out.
        if state_lock.revealed || state_lock.splash_shown_at.is_some() {
            (false, false)
        } else {
            state_lock.splash_shown_at = Some(Instant::now());
            // If main finished first (pending_reveal), take over the handoff so
            // the splash stays up for SPLASH_MIN_VISIBLE.
            let takeover = state_lock.pending_reveal && !state_lock.revealed;
            if takeover {
                state_lock.revealed = true;
                state_lock.pending_reveal = false;
            }
            (true, takeover)
        }
    };

    if should_show {
        match app.get_webview_window("splashscreen") {
            Some(splash_window) => {
                if let Err(e) = splash_window.show() {
                    eprintln!("failed to show splashscreen: {:?}", e);
                }
            }
            None => eprintln!("splashscreen window not found"),
        }
    }

    if takeover {
        // Both tasks are already done; hold the splash for its minimum time.
        let app_handle = app.clone();
        spawn(async move {
            sleep(SPLASH_MIN_VISIBLE).await;
            reveal_main_window(&app_handle);
        });
    }

    Ok(())
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
    let remaining = {
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
            // Claimed now, before the wait below: the handoff is committed, so
            // nothing else should try to reveal while it is pending.
            match state_lock.splash_shown_at {
                Some(shown) => {
                    state_lock.revealed = true;
                    Some(SPLASH_MIN_VISIBLE.saturating_sub(shown.elapsed()))
                }
                // Splash hasn't painted yet. Don't reveal into a blank screen —
                // defer the handoff to splash_ready, which will show the splash
                // and hold it for SPLASH_MIN_VISIBLE. revealed stays false so
                // the watchdog still fires if the splash webview is dead.
                None => {
                    state_lock.pending_reveal = true;
                    None
                }
            }
        } else {
            None
        }
    };

    if let Some(remaining) = remaining {
        // Spawned rather than awaited inline so the invoke returns immediately.
        // The caller has no use for the reveal, and blocking it for the rest of
        // the splash's time on screen would look like a hung command.
        let app_handle = app.clone();
        spawn(async move {
            if !remaining.is_zero() {
                sleep(remaining).await;
            }
            reveal_main_window(&app_handle);
        });
    }

    Ok(())
}

/// Backend startup work.
///
/// This used to `sleep(3s)` to fake being busy. There is genuinely nothing
/// heavyweight to do here — the wallpaper library directory is created lazily on
/// the first download — so report ready immediately and let the frontend's own
/// readiness decide when the window appears.
///
/// The update check runs while the splash is on screen: `SPLASH_MIN_VISIBLE`
/// already keeps the splash up for a few seconds, so anything that finishes
/// inside that budget costs nothing at launch. The check is fire-and-forget —
/// it never delays the handoff, and its result is read later via
/// `get_update_status`.
async fn setup(app: AppHandle) -> Result<(), ()> {
    let check_app = app.clone();
    let check_state = app.state::<Arc<Mutex<UpdateState>>>().inner().clone();
    spawn(async move {
        run_update_check(check_app, check_state).await;
    });

    set_complete(
        app.clone(),
        app.state::<Mutex<SetupState>>(),
        "backend".to_string(),
    )
    .await?;
    Ok(())
}

/// Check for an update and record the outcome in `UpdateState`. Runs in the
/// background during the splash; failures are logged, not fatal.
async fn run_update_check(app: AppHandle, state: Arc<Mutex<UpdateState>>) {
    let result = async {
        let updater = app.updater()?;
        updater.check().await
    }
    .await;
    let mut guard = match state.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("failed to lock update state: {}", e);
            return;
        }
    };
    guard.checked = true;
    match result {
        Ok(Some(update)) => {
            eprintln!("update available: v{}", update.version);
            guard.available = true;
            guard.version = Some(update.version.to_string());
        }
        Ok(None) => {
            eprintln!("app is up to date");
        }
        Err(e) => {
            eprintln!("update check failed: {}", e);
        }
    }
}

/// Return whether an update is available, waiting for the splash-time check to
/// settle if it has not done so yet.
#[tauri::command]
async fn get_update_status(
    state: State<'_, Arc<Mutex<UpdateState>>>,
) -> Result<UpdateState, ()> {
    // Wait up to STARTUP_TIMEOUT for the background check to finish so a slow
    // network still yields a definitive answer rather than a false "no update".
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        {
            let checked = state.lock().map(|g| g.checked).unwrap_or(true);
            if checked || Instant::now() >= deadline {
                break;
            }
        }
        sleep(Duration::from_millis(100)).await;
    }

    Ok(state
        .lock()
        .map(|g| UpdateState {
            checked: g.checked,
            available: g.available,
            version: g.version.clone(),
        })
        .unwrap_or(UpdateState {
            checked: true,
            available: false,
            version: None,
        }))
}

/// Run an update check on demand from the main window. This avoids relying only
/// on the fire-and-forget splash check, which can finish before the frontend
/// mounts or fail transiently while the app is starting.
#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    state: State<'_, Arc<Mutex<UpdateState>>>,
) -> Result<UpdateState, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let result = updater.check().await.map_err(|e| e.to_string())?;

    let mut guard = state
        .lock()
        .map_err(|e| format!("failed to lock update state: {e}"))?;
    guard.checked = true;
    guard.available = result.is_some();
    guard.version = result.map(|update| update.version.to_string());

    Ok(guard.clone())
}

/// Download and install the pending update, then restart the app. Emits
/// `update://progress` events (of shape `UpdateProgress`) while downloading.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let update = match update {
        Some(u) => u,
        None => return Err("no update available".into()),
    };

    let downloaded = std::sync::atomic::AtomicU64::new(0);
    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded.fetch_add(chunk_length as u64, Ordering::Relaxed);
                let _ = progress_app.emit(
                    "update://progress",
                    UpdateProgress {
                        downloaded: downloaded.load(Ordering::Relaxed),
                        total: content_length,
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    eprintln!("update installed, restarting");
    // restarts the app, diverges
    app.restart()
}
