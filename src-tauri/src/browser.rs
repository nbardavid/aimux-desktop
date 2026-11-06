//! The right panel's browser: native child webviews of the main window, one per open page,
//! laid over a placeholder the webview positions. Pages are the open web: no capability
//! names them, so Tauri refuses any command from them.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, State, Url, WebviewBuilder,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

/// Pages kept alive at once; past that, the least recently shown is closed (and made again
/// when its tab comes back).
const MAX_LIVE: usize = 6;
/// Safari has sent this frozen WebKit version in its user agent for years.
const FROZEN_WEBKIT: &str = "605.1.15";

/// Safari's own user agent for `safari_version` ("26.6.2"): Google refuses its sign-in to
/// anything that reads like an embedded webview.
pub fn safari_user_agent(safari_version: &str) -> String {
    let digits = |s: &&str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    let mut parts = safari_version.split('.');
    let version = match parts.next().filter(digits) {
        Some(major) => format!("{major}.{}", parts.next().filter(digits).unwrap_or("0")),
        None => "18.0".to_string(),
    };
    format!(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/{FROZEN_WEBKIT} (KHTML, like Gecko) Version/{version} Safari/{FROZEN_WEBKIT}"
    )
}

/// The `<string>` right after `<key>{key}</key>` in an XML property list.
pub fn plist_string(xml: &str, key: &str) -> Option<String> {
    let tag = format!("<key>{key}</key>");
    let rest = &xml[xml.find(&tag)? + tag.len()..];
    let start = rest.find("<string>")? + "<string>".len();
    if rest[..start].contains("<key>") {
        return None;
    }
    let end = rest[start..].find("</string>")?;
    Some(rest[start..start + end].to_string())
}

fn user_agent() -> String {
    let xml =
        std::fs::read_to_string("/Applications/Safari.app/Contents/Info.plist").unwrap_or_default();
    safari_user_agent(&plist_string(&xml, "CFBundleShortVersionString").unwrap_or_default())
}

/// What a page may load: the web, and the `about:`, `blob:` and `data:` frames pages build
/// themselves. Never `file:`, `javascript:`, or the app itself (its own origins and the dev
/// server's), which Tauri would treat as local and let call the app's commands.
pub fn allowed(url: &Url) -> bool {
    let app = url.scheme() == "tauri"
        || url.host_str() == Some("tauri.localhost")
        || (url.host_str() == Some("localhost") && url.port() == Some(1420));
    !app && matches!(url.scheme(), "http" | "https" | "about" | "blob" | "data")
}

/// Sign-in flows that need a popup of their own (`window.opener`); every other new window
/// goes to the default browser.
pub fn opens_as_popup(url: &Url) -> bool {
    match url.host_str() {
        Some("accounts.google.com" | "appleid.apple.com") => true,
        Some("claude.ai") => ["/login", "/oauth", "/auth"]
            .iter()
            .any(|p| url.path().starts_with(p)),
        _ => false,
    }
}

/// A panel page's webview (not a sign-in popup's).
pub fn is_page(label: &str) -> bool {
    label.starts_with("browser-") && !label.starts_with("browser-popup-")
}

/// The webview label for a page id the app chose (`[a-z0-9-]`, 1 to 40 characters).
pub fn label_for(id: &str) -> Option<String> {
    let ok = !id.is_empty()
        && id.len() <= 40
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    ok.then(|| format!("browser-{id}"))
}

/// Where a page sits, in logical pixels from the window content's top left.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    fn rect(self) -> Rect {
        Rect {
            position: LogicalPosition::new(self.x, self.y).into(),
            size: LogicalSize::new(self.width.max(1.0), self.height.max(1.0)).into(),
        }
    }
}

/// The live pages (label and the URL each was opened on, least recently shown first), and a
/// lock held across a whole show or hide-all so one never lands in the middle of the other.
#[derive(Default)]
pub struct Browsers {
    live: Mutex<Vec<(String, String)>>,
    order: Mutex<()>,
}

#[derive(Clone, Serialize)]
struct Title {
    id: String,
    title: String,
}

#[derive(Clone, Serialize)]
struct Loaded {
    id: String,
}

fn id_of(label: &str) -> String {
    label.strip_prefix("browser-").unwrap_or(label).to_string()
}

static POPUPS: AtomicU32 = AtomicU32::new(0);

/// What `window.close()` becomes in a popup: wry ignores the real one.
const CLOSE_SENTINEL: &str = "aimux-close";

/// A new window a page asks for: sign-in gets a small popup of its own (so `window.opener`
/// works); any other web link opens in the default browser; anything else is refused.
fn new_window(
    app: &AppHandle,
    url: &Url,
    features: tauri::webview::NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    if !matches!(url.scheme(), "http" | "https") || !allowed(url) {
        return NewWindowResponse::Deny;
    }
    if !opens_as_popup(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
        return NewWindowResponse::Deny;
    }
    let label = format!("browser-popup-{}", POPUPS.fetch_add(1, Ordering::Relaxed));
    let blank = WebviewUrl::External("about:blank".parse().expect("about:blank"));
    let closer = app.clone();
    let own = label.clone();
    let built = WebviewWindowBuilder::new(app, label, blank)
        .window_features(features)
        .user_agent(&user_agent())
        .title(url.host_str().unwrap_or("Sign in"))
        .initialization_script(format!(
            "window.close = () => {{ location.href = '{CLOSE_SENTINEL}://now' }}"
        ))
        .on_navigation(move |to| {
            if to.scheme() != CLOSE_SENTINEL {
                return allowed(to);
            }
            if let Some(window) = closer.get_webview_window(&own) {
                let _ = window.close();
            }
            false
        })
        .build();
    match built {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

fn create(app: &AppHandle, label: &str, url: Url, bounds: Bounds) -> Result<(), String> {
    let window = app.get_window("main").ok_or("no main window")?;
    let titles = app.clone();
    let loads = app.clone();
    let popups = app.clone();
    let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
        .user_agent(&user_agent())
        .on_navigation(allowed)
        .on_document_title_changed(move |webview, title| {
            let id = id_of(webview.label());
            let _ = titles.emit_to("main", "browser-title", Title { id, title });
        })
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let id = id_of(webview.label());
                let _ = loads.emit_to("main", "browser-loaded", Loaded { id });
            }
        })
        .on_new_window(move |url, features| new_window(&popups, &url, features))
        // Made while you work elsewhere: it must not bring the app forward.
        .focused(false);
    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn live(browsers: &Browsers) -> std::sync::MutexGuard<'_, Vec<(String, String)>> {
    browsers.live.lock().unwrap_or_else(|e| e.into_inner())
}

/// Shows page `id` on `url` at `bounds`, making it if needed. Never takes the keyboard.
#[tauri::command(async)]
pub fn browser_show(
    app: AppHandle,
    browsers: State<'_, Browsers>,
    id: String,
    url: String,
    bounds: Bounds,
) -> Result<(), String> {
    let label = label_for(&id).ok_or("bad page id")?;
    let parsed: Url = url.parse().map_err(|_| "bad url")?;
    if !matches!(parsed.scheme(), "http" | "https") || !allowed(&parsed) {
        return Err("only web pages open here".into());
    }
    let _order = browsers.order.lock().unwrap_or_else(|e| e.into_inner());
    let opened_on = live(&browsers)
        .iter()
        .find(|(l, _)| *l == label)
        .map(|(_, u)| u.clone());
    match (app.get_webview(&label), opened_on) {
        (Some(webview), Some(on)) => {
            webview
                .set_bounds(bounds.rect())
                .map_err(|e| e.to_string())?;
            if on != url {
                webview.navigate(parsed).map_err(|e| e.to_string())?;
            }
            webview.show().map_err(|e| e.to_string())?;
        }
        _ => create(&app, &label, parsed, bounds)?,
    }
    let evicted: Vec<String> = {
        let mut list = live(&browsers);
        list.retain(|(l, _)| *l != label);
        list.push((label, url));
        let over = list.len().saturating_sub(MAX_LIVE);
        list.drain(..over).map(|(l, _)| l).collect()
    };
    for label in evicted {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn browser_bounds(app: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    match app.get_webview(&label_for(&id).ok_or("bad page id")?) {
        Some(webview) => webview.set_bounds(bounds.rect()).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn browser_hide(app: AppHandle, id: String) -> Result<(), String> {
    match app.get_webview(&label_for(&id).ok_or("bad page id")?) {
        Some(webview) => webview.hide().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Hides every page, the one still being made included (Tauri knows it before `live` does).
#[tauri::command(async)]
pub fn browser_hide_all(app: AppHandle, browsers: State<'_, Browsers>) -> Result<(), String> {
    let _order = browsers.order.lock().unwrap_or_else(|e| e.into_inner());
    for (label, webview) in app.webviews() {
        if is_page(&label) {
            webview.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn browser_back(app: AppHandle, id: String) -> Result<(), String> {
    match app.get_webview(&label_for(&id).ok_or("bad page id")?) {
        Some(webview) => webview.eval("history.back()").map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn browser_reload(app: AppHandle, id: String) -> Result<(), String> {
    match app.get_webview(&label_for(&id).ok_or("bad page id")?) {
        Some(webview) => webview.reload().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn browser_close(
    app: AppHandle,
    browsers: State<'_, Browsers>,
    id: String,
) -> Result<(), String> {
    browser_close_many(app, browsers, vec![id])
}

/// Closes pages for good (a closed tab, a removed workspace).
#[tauri::command(async)]
pub fn browser_close_many(
    app: AppHandle,
    browsers: State<'_, Browsers>,
    ids: Vec<String>,
) -> Result<(), String> {
    let labels: Vec<String> = ids.iter().filter_map(|id| label_for(id)).collect();
    live(&browsers).retain(|(l, _)| !labels.contains(l));
    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_agent_reads_like_safari() {
        assert_eq!(
            safari_user_agent("26.6.2"),
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15"
        );
        assert!(safari_user_agent("").contains("Version/18.0 Safari/"));
    }

    #[test]
    fn plist_strings_are_read_by_key() {
        let xml = "<dict><key>CFBundleName</key><string>Safari</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>26.6.2</string></dict>";
        assert_eq!(
            plist_string(xml, "CFBundleShortVersionString").as_deref(),
            Some("26.6.2")
        );
        assert_eq!(plist_string(xml, "Missing"), None);
    }

    #[test]
    fn frames_may_use_about_blob_and_data() {
        for url in [
            "about:blank",
            "about:srcdoc",
            "blob:https://claude.ai/1-2",
            "data:text/html,x",
        ] {
            assert!(allowed(&url.parse().unwrap()), "{url}");
        }
    }

    #[test]
    fn the_app_itself_never_loads_in_a_page() {
        for url in [
            "tauri://localhost/",
            "http://tauri.localhost/",
            "http://localhost:1420/x",
        ] {
            assert!(!allowed(&url.parse().unwrap()), "{url}");
        }
        assert!(allowed(&"http://localhost:3000/".parse().unwrap()));
    }

    #[test]
    fn only_sign_in_opens_a_popup() {
        for (url, popup) in [
            ("https://accounts.google.com/o/oauth2/v2/auth?x=1", true),
            ("https://appleid.apple.com/auth/authorize", true),
            ("https://claude.ai/login?x", true),
            ("https://example.com/docs", false),
            ("https://claude.ai/artifact/abc", false),
        ] {
            assert_eq!(opens_as_popup(&url.parse().unwrap()), popup, "{url}");
        }
    }

    #[test]
    fn page_labels_are_recognised() {
        assert!(is_page("browser-abc"));
        assert!(!is_page("browser-popup-3"));
        assert!(!is_page("main"));
    }

    #[test]
    fn only_web_urls_load() {
        for (url, ok) in [
            ("https://claude.ai/artifact/x", true),
            ("http://localhost:3000/", true),
            ("file:///etc/passwd", false),
            ("tauri://localhost/", false),
            ("javascript:alert(1)", false),
        ] {
            assert_eq!(allowed(&url.parse().unwrap()), ok, "{url}");
        }
    }

    #[test]
    fn labels_refuse_odd_ids() {
        assert_eq!(label_for("a1b2-c3").as_deref(), Some("browser-a1b2-c3"));
        for id in ["", "../x", "ABC", "a b", &"x".repeat(41)] {
            assert_eq!(label_for(id), None, "{id}");
        }
    }
}
