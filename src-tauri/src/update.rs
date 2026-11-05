//! App updates from the GitHub releases, signed with the project's key. Installing one restarts
//! the window only: the background host keeps running what it runs.

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

async fn latest(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

/// The newer version on offer, if any. A dev build never updates itself.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<String>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    Ok(latest(&app).await?.map(|u| u.version))
}

/// Downloads, checks the signature, replaces the app, and relaunches it.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = latest(&app).await?.ok_or("Already up to date.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}
