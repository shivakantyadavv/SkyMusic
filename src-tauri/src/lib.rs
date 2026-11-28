mod audio_ops;
mod lan_sync;
mod yt_stream;

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use tauri::{Emitter, Manager};

use audio_ops::{
    download_track_hq, mime_type_for_path, register_local_audio, resolve_yt_playback_url,
    BridgePort, LocalFileRegistry,
};
use lan_sync::{
    get_lan_devices, init_lan_sync, probe_lan_ip, refresh_lan_discovery, send_lan_cast,
    start_lan_sync_service, sync_with_lan_peer, update_lan_snapshot,
};
use yt_stream::{resolve_yt_stream, search_youtube_ids_internal, shared_http};

const YT_PLAYER_HTML: &str = include_str!("../../public/yt-player.html");

#[tauri::command]
fn get_yt_bridge_port(state: tauri::State<'_, BridgePort>) -> u16 {
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
    let mut file = File::create(&target_path)
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

#[tauri::command]
async fn search_youtube_ids(query: String) -> Result<Vec<String>, String> {
    search_youtube_ids_internal(&query).await
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next().unwrap_or("");
        let v = parts.next().unwrap_or("");
        if k == key {
            return Some(percent_decode(v));
        }
    }
    None
}

fn write_cors_options(stream: &mut TcpStream) {
    let resp = "HTTP/1.1 204 No Content\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
                Access-Control-Allow-Headers: Range, Content-Type\r\n\
                Access-Control-Max-Age: 86400\r\n\
                Connection: close\r\n\r\n";
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn write_not_found(stream: &mut TcpStream) {
    let resp = "HTTP/1.1 404 Not Found\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Content-Length: 0\r\n\
                Connection: close\r\n\r\n";
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn parse_byte_range(range_hdr: &str, total_len: u64) -> Option<(u64, u64)> {
    let spec = range_hdr.trim().strip_prefix("bytes=")?;
    let mut parts = spec.splitn(2, '-');
    let start_s = parts.next()?.trim();
    let end_s = parts.next()?.trim();

    if total_len == 0 {
        return None;
    }

    if start_s.is_empty() {
        let suffix: u64 = end_s.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = total_len.saturating_sub(suffix);
        return Some((start, total_len - 1));
    }

    let start: u64 = start_s.parse().ok()?;
    if start >= total_len {
        return None;
    }
    let end = if end_s.is_empty() {
        total_len - 1
    } else {
        end_s.parse::<u64>().ok()?.min(total_len - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

fn serve_local_file(
    stream: &mut TcpStream,
    app: &tauri::AppHandle,
    file_id: &str,
    range_hdr: Option<&str>,
    is_head: bool,
) {
    let registry = app.state::<LocalFileRegistry>();
    let Some(path) = registry.get_path(file_id) else {
        write_not_found(stream);
        return;
    };
    let Ok(mut file) = File::open(&path) else {
        write_not_found(stream);
        return;
    };
    let Ok(meta) = file.metadata() else {
        write_not_found(stream);
        return;
    };
    let total_len = meta.len();
    let mime = mime_type_for_path(&path);

    if let Some((start, end)) = range_hdr.and_then(|r| parse_byte_range(r, total_len)) {
        let chunk_len = end - start + 1;
        let header = format!(
            "HTTP/1.1 206 Partial Content\r\n\
             Content-Type: {mime}\r\n\
             Content-Length: {chunk_len}\r\n\
             Content-Range: bytes {start}-{end}/{total_len}\r\n\
             Accept-Ranges: bytes\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
             Connection: close\r\n\r\n"
        );
        if stream.write_all(header.as_bytes()).is_err() || is_head {
            let _ = stream.flush();
            return;
        }
        if file.seek(SeekFrom::Start(start)).is_ok() {
            let mut remaining = chunk_len;
            let mut buf = [0u8; 65536];
            while remaining > 0 {
                let to_read = (remaining as usize).min(buf.len());
                match file.read(&mut buf[..to_read]) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if stream.write_all(&buf[..n]).is_err() {
                            break;
                        }
                        remaining -= n as u64;
                    }
                }
            }
        }
        let _ = stream.flush();
        return;
    }

    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: {mime}\r\n\
         Content-Length: {total_len}\r\n\
         Accept-Ranges: bytes\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Connection: close\r\n\r\n"
    );
    if stream.write_all(header.as_bytes()).is_err() || is_head {
        let _ = stream.flush();
        return;
    }
    let mut buf = [0u8; 65536];
    while let Ok(n) = file.read(&mut buf) {
        if n == 0 || stream.write_all(&buf[..n]).is_err() {
            break;
        }
    }
    let _ = stream.flush();
}

fn proxy_remote_audio(
    stream: &mut TcpStream,
    upstream_url: &str,
    user_agent: &str,
    fallback_mime: &str,
    range_hdr: Option<&str>,
    is_head: bool,
) {
    let url = upstream_url.to_string();
    let ua = user_agent.to_string();
    let range = range_hdr.map(|s| s.to_string());
    let fallback_mime = fallback_mime.to_string();

    let res_result = tauri::async_runtime::block_on(async {
        let client = shared_http();
        let mut req = if is_head {
            client.head(&url)
        } else {
            client.get(&url)
        };
        req = req.header("User-Agent", ua);
        if let Some(r) = range {
            req = req.header("Range", r);
        }
        req.send().await
    });

    let Ok(mut res) = res_result else {
        write_not_found(stream);
        return;
    };

    if !res.status().is_success() && res.status().as_u16() != 206 {
        write_not_found(stream);
        return;
    }

    let status_code = res.status().as_u16();
    let status_reason = if status_code == 206 {
        "Partial Content"
    } else {
        "OK"
    };
    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or(&fallback_mime)
        .to_string();
    let content_length = res
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .map(|s| format!("Content-Length: {s}\r\n"))
        .unwrap_or_default();
    let content_range = res
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .map(|s| format!("Content-Range: {s}\r\n"))
        .unwrap_or_default();

    let header = format!(
        "HTTP/1.1 {status_code} {status_reason}\r\n\
         Content-Type: {content_type}\r\n\
         {content_length}\
         {content_range}\
         Accept-Ranges: bytes\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\r\n"
    );

    if stream.write_all(header.as_bytes()).is_err() || is_head {
        let _ = stream.flush();
        return;
    }

    loop {
        let next_chunk = tauri::async_runtime::block_on(res.chunk());
        match next_chunk {
            Ok(Some(bytes)) => {
                if stream.write_all(&bytes).is_err() {
                    break;
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
    let _ = stream.flush();
}

fn handle_client(mut stream: TcpStream, app: tauri::AppHandle) {
    let Ok(cloned) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(cloned);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }

    let mut parts = request_line.trim().split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let target = parts.next().unwrap_or("/");

    let mut range_hdr: Option<String> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("range") {
                range_hdr = Some(v.trim().to_string());
            }
        }
    }

    if method.eq_ignore_ascii_case("OPTIONS") {
        write_cors_options(&mut stream);
        return;
    }
    let is_head = method.eq_ignore_ascii_case("HEAD");

    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    match path {
        "/yt-player.html" | "/" => {
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
            if !is_head {
                let _ = stream.write_all(body);
            }
            let _ = stream.flush();
        }
        "/local" => {
            if let Some(id) = query_param(query, "id") {
                serve_local_file(&mut stream, &app, &id, range_hdr.as_deref(), is_head);
            } else {
                write_not_found(&mut stream);
            }
        }
        "/stream" => {
            let Some(video_id) = query_param(query, "v") else {
                write_not_found(&mut stream);
                return;
            };
            let resolved =
                tauri::async_runtime::block_on(resolve_yt_stream(&video_id, false));
            match resolved {
                Ok(yt) => proxy_remote_audio(
                    &mut stream,
                    &yt.url,
                    &yt.user_agent,
                    &yt.mime_type,
                    range_hdr.as_deref(),
                    is_head,
                ),
                Err(_) => write_not_found(&mut stream),
            }
        }
        "/proxy" => {
            let Some(raw_url) = query_param(query, "url") else {
                write_not_found(&mut stream);
                return;
            };
            if !raw_url.starts_with("https://") {
                write_not_found(&mut stream);
                return;
            }
            proxy_remote_audio(
                &mut stream,
                &raw_url,
                "Mozilla/5.0",
                "audio/mpeg",
                range_hdr.as_deref(),
                is_head,
            );
        }
        _ => write_not_found(&mut stream),
    }
}

fn spawn_accept_loop(listener: TcpListener, app: tauri::AppHandle) {
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else {
                continue;
            };
            let app_handle = app.clone();
            thread::spawn(move || handle_client(stream, app_handle));
        }
    });
}

fn start_yt_bridge_server(app: tauri::AppHandle) -> u16 {
    let v4_listener =
        TcpListener::bind("127.0.0.1:0").expect("failed to bind local Skymusic audio bridge");
    let port = v4_listener.local_addr().map(|a| a.port()).unwrap_or(0);
    spawn_accept_loop(v4_listener, app.clone());

    if let Ok(v6_listener) = TcpListener::bind(format!("[::1]:{port}")) {
        spawn_accept_loop(v6_listener, app);
    }

    port
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(LocalFileRegistry::default())
        .setup(|app| {
            let port = start_yt_bridge_server(app.handle().clone());
            app.manage(BridgePort(port));
            let lan_state = start_lan_sync_service(app.handle().clone());
            app.manage(lan_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_yt_bridge_port,
            get_app_version,
            download_apk_to_cache,
            search_youtube_ids,
            register_local_audio,
            resolve_yt_playback_url,
            download_track_hq,
            init_lan_sync,
            update_lan_snapshot,
            get_lan_devices,
            refresh_lan_discovery,
            probe_lan_ip,
            sync_with_lan_peer,
            send_lan_cast
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
