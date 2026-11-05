pub mod chat;
pub mod commands;
pub mod files;
pub mod frame;
pub mod git;
pub mod git_write;
pub mod link;
pub mod paths;

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
        .manage(commands::DaemonState::default())
        .manage(chat::ChatState::default())
        .invoke_handler(tauri::generate_handler![
            chat::chat_start,
            chat::chat_send,
            chat::chat_stop,
            chat::claude_models,
            commands::daemon_connect,
            commands::daemon_send,
            commands::list_projects,
            commands::ensure_daemon,
            commands::list_workspaces,
            commands::create_tab,
            commands::create_project,
            commands::create_workspace,
            commands::remove_workspace,
            commands::close_project,
            commands::run_setup,
            commands::setup_agent,
            files::read_stats,
            files::read_settings,
            files::write_setting,
            files::read_quota_cache,
            files::write_quota_cache,
            files::fetch_claude_usage,
            files::setup_status,
            files::ensure_setup_script,
            files::edit_setup_script,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
