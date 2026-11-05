#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The background host: same binary, no Tauri, no window, no Dock icon.
    if std::env::args().any(|a| a == "--host") {
        aimux_desktop_lib::host::run();
        return;
    }
    aimux_desktop_lib::run()
}
