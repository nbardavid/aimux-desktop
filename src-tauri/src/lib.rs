pub mod browser;
pub mod chat;
pub mod git;
pub mod git_write;
pub mod host;
pub mod host_client;
pub mod mcp;
pub mod pty;
pub mod quota;
pub mod sessions;
pub mod store;
pub mod update;

use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

/// macOS' default menu, less Close Window: ⌘W belongs to the app, which closes a tab with it.
fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let sep = || PredefinedMenuItem::separator(app);
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "aimux",
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &sep()?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &sep()?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &sep()?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?,
        ],
    )
}

pub fn run() {
    tauri::Builder::default()
        .menu(menu)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(host_client::Presence::default())
        .manage(store::Store::default())
        .manage(browser::Browsers::default())
        .invoke_handler(tauri::generate_handler![
            host_client::host_status,
            host_client::host_restart,
            host_client::chat_open,
            host_client::host_answer,
            host_client::chat_send,
            host_client::chat_stop,
            host_client::term_open,
            host_client::term_write,
            host_client::term_resize,
            host_client::term_kill,
            chat::chat_history,
            chat::claude_models,
            sessions::claude_sessions,
            store::catalog,
            store::project_add,
            store::project_remove,
            store::project_open,
            store::workspace_create,
            store::workspace_remove,
            store::workspace_rename,
            store::chat_save,
            store::artifact_add,
            store::artifact_close,
            store::artifact_seen,
            store::chat_forget,
            store::read_settings,
            store::write_setting,
            store::setup_status,
            store::ensure_setup_script,
            store::edit_setup_script,
            store::setup_ran,
            store::run_command,
            store::set_run_command,
            quota::read_quota_cache,
            quota::write_quota_cache,
            quota::fetch_claude_usage,
            git::git_status,
            git::git_diff,
            git::git_branches,
            git::pr_view,
            git_write::git_stage,
            git_write::git_unstage,
            git_write::git_discard,
            git_write::git_push,
            git_write::git_branch,
            git_write::git_checkout,
            git_write::pr_merge,
            browser::browser_show,
            browser::browser_bounds,
            browser::browser_hide,
            browser::browser_hide_all,
            browser::browser_back,
            browser::browser_reload,
            browser::browser_close,
            browser::browser_close_many,
            update::update_check,
            update::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
