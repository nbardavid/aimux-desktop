pub mod chat;
pub mod commands;
pub mod files;
pub mod frame;
pub mod git;
pub mod link;
pub mod paths;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::DaemonState::default())
        .manage(chat::ChatState::default())
        .invoke_handler(tauri::generate_handler![
            chat::chat_start,
            chat::chat_send,
            chat::chat_stop,
            commands::daemon_connect,
            commands::daemon_send,
            commands::list_projects,
            commands::ensure_daemon,
            commands::list_workspaces,
            commands::create_tab,
            commands::create_project,
            commands::create_workspace,
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
            git::pr_view,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
