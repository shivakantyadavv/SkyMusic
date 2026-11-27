use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use tauri::{Emitter, Manager};

const YT_PLAYER_HTML: &str = include_str!("../../public/yt-player.html");

struct YtBridgePort(u16);

#[tauri::command]
fn get_yt_bridge_port(state: tauri::State<'_, YtBridgePort>) -> u16 {
    state.0
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn download_apk_to_cache(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to locate cache directory: {e}"))?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;

    let target_path = cache_dir.join("skymusic-update.apk");

    let client = tauri_plugin_http::reqwest::Client::builder()
        .user_agent("Skymusic-Updater/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("HTTP error {} downloading APK", res.status()));
    }

    let total = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&target_path)
        .map_err(|e| format!("Failed to create APK file: {e}"))?;

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let pct = ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u8;
            let _ = app.emit("apk-download-progress", pct);
        }
    }
    file.flush().map_err(|e| e.to_string())?;

    Ok(target_path.to_string_lossy().to_string())
}

fn extract_video_ids(html: &str, max_count: usize) -> Vec<String> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();

    let markers = [
        "\"videoRenderer\":{\"videoId\":\"",
        "\"videoWithContextRenderer\":{\"videoId\":\"",
        "\"compactVideoRenderer\":{\"videoId\":\"",
    ];

    for marker in markers {
        let mut rest = html;
        while let Some(idx) = rest.find(marker) {
            let after = &rest[idx + marker.len()..];
            if after.len() >= 11 {
                let candidate = &after[..11];
                if candidate
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                    && seen.insert(candidate.to_string())
                {
                    ids.push(candidate.to_string());
                    if ids.len() >= max_count {
                        return ids;
                    }
                }
            }
            rest = after;
        }
    }

    let fallback_marker = "\"videoId\":\"";
    let mut rest = html;
    while let Some(idx) = rest.find(fallback_marker) {
        let after = &rest[idx + fallback_marker.len()..];
        if after.len() >= 11 {
            let candidate = &after[..11];
            let quote_after = after.as_bytes().get(11) == Some(&b'"');
            if quote_after
                && candidate
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                && seen.insert(candidate.to_string())
            {
                ids.push(candidate.to_string());
                if ids.len() >= max_count {
                    return ids;
                }
            }
        }
        rest = after;
    }

    ids
}

#[tauri::command]
async fn search_youtube_ids(query: String) -> Result<Vec<String>, String> {
    let client = tauri_plugin_http::reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("https://www.youtube.com/results")
        .query(&[("search_query", &query)])
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let html = res.text().await.map_err(|e| e.to_string())?;
    Ok(extract_video_ids(&html, 8))
}

fn spawn_accept_loop(listener: TcpListener) {
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else {
                continue;
            };
            thread::spawn(move || {
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf);
                let body = YT_PLAYER_HTML.as_bytes();
                let header = format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: text/html; charset=utf-8\r\n\
                     Referrer-Policy: strict-origin-when-cross-origin\r\n\
                     Access-Control-Allow-Origin: *\r\n\
                     Cache-Control: no-store\r\n\
                     Connection: close\r\n\
                     Content-Length: {}\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(header.as_bytes());
                let _ = stream.write_all(body);
                let _ = stream.flush();
            });
        }
    });
}

fn start_yt_bridge_server() -> u16 {
    let v4_listener =
        TcpListener::bind("127.0.0.1:0").expect("failed to bind local YouTube bridge");
    let port = v4_listener.local_addr().map(|a| a.port()).unwrap_or(0);
    spawn_accept_loop(v4_listener);

    if let Ok(v6_listener) = TcpListener::bind(format!("[::1]:{port}")) {
        spawn_accept_loop(v6_listener);
    }

    port
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge_port = start_yt_bridge_server();

    let builder = tauri::Builder::default()
        .manage(YtBridgePort(bridge_port))
        .invoke_handler(tauri::generate_handler![
            get_yt_bridge_port,
            get_app_version,
            download_apk_to_cache,
            search_youtube_ids
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Skymusic");
}
