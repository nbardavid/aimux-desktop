pub mod commands;
pub mod frame;
pub mod git;
pub mod link;
pub mod paths;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::DaemonState::default())
        .invoke_handler(tauri::generate_handler![
            commands::daemon_connect,
            commands::daemon_send,
            commands::list_projects,
            commands::ensure_daemon,
            commands::list_workspaces,
            commands::create_tab,
            git::git_status,
            git::git_diff,
            git::pr_view,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
