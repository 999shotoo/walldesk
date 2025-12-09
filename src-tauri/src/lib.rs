mod wallpaper;
use std::sync::Mutex;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager, State};
use tokio::time::{sleep, Duration};

// Create a struct we'll use to track the completion of
// setup related tasks
struct SetupState {
    frontend_task: bool,
    backend_task: bool,
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
        }))
        .invoke_handler(tauri::generate_handler![
            wallpaper::get_wallpaper,
            wallpaper::get_wallpaper_info,
            wallpaper::get_wallpaper_preview,
            greet,
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
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello {name} from Rust!")
}

// A custom task for setting the state of a setup task
#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), ()> {
    // Lock the state with write access (handle poisoning)
    let mut state_lock = match state.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("failed to lock setup state: {}", e);
            return Err(());
        }
    };

    println!("set_complete called for task='{}'", task);

    match task.as_str() {
        "frontend" => state_lock.frontend_task = true,
        "backend" => state_lock.backend_task = true,
        _ => {
            eprintln!("invalid task completed: {}", task);
            return Err(());
        }
    }

    println!(
        "current setup state: backend={}, frontend={}",
        state_lock.backend_task, state_lock.frontend_task
    );

    // Check if both tasks are completed
    if state_lock.backend_task && state_lock.frontend_task {
        println!("both setup tasks complete, attempting to switch windows");
        // Setup is complete, attempt to close the splashscreen and unhide main window.
        if let Some(splash_window) = app.get_webview_window("splashscreen") {
            if let Err(e) = splash_window.close() {
                eprintln!("failed to close splashscreen: {:?}", e);
            } else {
                println!("splashscreen closed");
            }
        } else {
            eprintln!("splashscreen window not found");
        }

        if let Some(main_window) = app.get_webview_window("main") {
            if let Err(e) = main_window.show() {
                eprintln!("failed to show main window: {:?}", e);
            } else {
                println!("main window shown");
            }
        } else {
            eprintln!("main window not found");
        }
    }
    Ok(())
}

// An async function that does some heavy setup task
async fn setup(app: AppHandle) -> Result<(), ()> {
    // Fake performing some heavy action for 3 seconds
    println!("Performing really heavy backend setup task...");
    sleep(Duration::from_secs(3)).await;
    println!("Backend setup task completed!");
    // Set the backend task as being completed
    // Commands can be ran as regular functions as long as you take
    // care of the input arguments yourself
    set_complete(
        app.clone(),
        app.state::<Mutex<SetupState>>(),
        "backend".to_string(),
    )
    .await?;
    Ok(())
}
