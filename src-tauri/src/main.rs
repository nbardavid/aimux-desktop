#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The background host: same binary, no Tauri, no window, no Dock icon.
    if std::env::args().any(|a| a == "--host") {
        aimux_desktop_lib::host::run();
        return;
    }
    // The MCP server a chat's Claude talks to, over stdio.
    let args: Vec<String> = std::env::args().collect();
    if let Some(at) = args.iter().position(|a| a == "--mcp") {
        aimux_desktop_lib::mcp::run(args.get(at + 1).cloned().unwrap_or_default());
        return;
    }
    aimux_desktop_lib::run()
}
