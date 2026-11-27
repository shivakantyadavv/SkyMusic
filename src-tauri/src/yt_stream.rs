use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const VISIONOS_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ANDROID_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

#[derive(Clone, Debug)]
pub struct CachedYtStream {
    pub video_id: String,
    pub url: String,
    pub mime_type: String,
    pub ext: String,
    pub bitrate_bps: u64,
    pub sample_rate: u32,
    pub content_length: u64,
    pub user_agent: String,
    pub chunked_range_only: bool,
    pub fetched_at: Instant,
}

static HTTP_CLIENT: OnceLock<tauri_plugin_http::reqwest::Client> = OnceLock::new();
static STREAM_CACHE: OnceLock<Mutex<HashMap<String, CachedYtStream>>> = OnceLock::new();

pub fn shared_http() -> &'static tauri_plugin_http::reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        tauri_plugin_http::reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(12))
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| tauri_plugin_http::reqwest::Client::new())
    })
}

fn cache_map() -> &'static Mutex<HashMap<String, CachedYtStream>> {
    STREAM_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get_cached_stream(video_id: &str) -> Option<CachedYtStream> {
    let mut guard = cache_map().lock().ok()?;
    if let Some(entry) = guard.get(video_id) {
        if entry.fetched_at.elapsed() < Duration::from_secs(1500) {
            return Some(entry.clone());
        }
        guard.remove(video_id);
    }
    None
}

fn store_cached_stream(entry: CachedYtStream) {
    if let Ok(mut guard) = cache_map().lock() {
        if guard.len() > 64 {
            guard.retain(|_, v| v.fetched_at.elapsed() < Duration::from_secs(1500));
        }
        guard.insert(entry.video_id.clone(), entry);
    }
}

pub fn extract_video_ids(html: &str, max_count: usize) -> Vec<String> {
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

pub async fn search_youtube_ids_internal(query: &str) -> Result<Vec<String>, String> {
    let res = shared_http()
        .get("https://www.youtube.com/results")
        .query(&[("search_query", query)])
        .header("User-Agent", WEB_UA)
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

async fn fetch_visitor_data(video_id: &str) -> String {
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let Ok(res) = shared_http()
        .get(&url)
        .header("User-Agent", WEB_UA)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    else {
        return String::new();
    };
    let Ok(html) = res.text().await else {
        return String::new();
    };
    let marker = "\"visitorData\":\"";
    if let Some(idx) = html.find(marker) {
        let rest = &html[idx + marker.len()..];
        if let Some(end) = rest.find('"') {
            return rest[..end].to_string();
        }
    }
    String::new()
}

fn pick_best_audio_format(json: &serde_json::Value) -> Option<(&serde_json::Value, String, String)> {
    let status = json
        .get("playabilityStatus")
        .and_then(|s| s.get("status"))
        .and_then(|s| s.as_str())
        .unwrap_or("");
    if status != "OK" {
        return None;
    }

    let formats = json
        .get("streamingData")
        .and_then(|s| s.get("adaptiveFormats"))
        .and_then(|f| f.as_array())?;

    let mut mp4_candidates: Vec<(&serde_json::Value, u64)> = Vec::new();
    let mut other_candidates: Vec<(&serde_json::Value, u64)> = Vec::new();

    for fmt in formats {
        let Some(url) = fmt.get("url").and_then(|u| u.as_str()) else {
            continue;
        };
        if url.is_empty() {
            continue;
        }
        let mime = fmt.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
        if !mime.starts_with("audio/") {
            continue;
        }
        let bitrate = fmt
            .get("averageBitrate")
            .or_else(|| fmt.get("bitrate"))
            .and_then(|b| b.as_u64())
            .unwrap_or(0);

        if mime.starts_with("audio/mp4") {
            mp4_candidates.push((fmt, bitrate));
        } else {
            other_candidates.push((fmt, bitrate));
        }
    }

    mp4_candidates.sort_by(|a, b| b.1.cmp(&a.1));
    if let Some((best, _)) = mp4_candidates.first() {
        return Some((*best, "audio/mp4".to_string(), "m4a".to_string()));
    }

    other_candidates.sort_by(|a, b| b.1.cmp(&a.1));
    if let Some((best, _)) = other_candidates.first() {
        let raw_mime = best
            .get("mimeType")
            .and_then(|m| m.as_str())
            .unwrap_or("audio/webm");
        let base_mime = raw_mime.split(';').next().unwrap_or("audio/webm").to_string();
        let ext = if base_mime.contains("mp4") {
            "m4a".to_string()
        } else {
            "webm".to_string()
        };
        return Some((*best, base_mime, ext));
    }

    None
}

fn build_stream_entry(
    video_id: &str,
    fmt: &serde_json::Value,
    mime_type: String,
    ext: String,
    user_agent: String,
    chunked_range_only: bool,
) -> Option<CachedYtStream> {
    let url = fmt.get("url")?.as_str()?.to_string();
    let bitrate_bps = fmt
        .get("averageBitrate")
        .or_else(|| fmt.get("bitrate"))
        .and_then(|b| b.as_u64())
        .unwrap_or(128_000);
    let sample_rate = fmt
        .get("audioSampleRate")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(44_100);
    let content_length = fmt
        .get("contentLength")
        .and_then(|c| c.as_str())
        .and_then(|c| c.parse::<u64>().ok())
        .unwrap_or(0);

    Some(CachedYtStream {
        video_id: video_id.to_string(),
        url,
        mime_type,
        ext,
        bitrate_bps,
        sample_rate,
        content_length,
        user_agent,
        chunked_range_only,
        fetched_at: Instant::now(),
    })
}

async fn resolve_with_visionos(video_id: &str, visitor_data: &str) -> Option<CachedYtStream> {
    let payload = serde_json::json!({
        "context": {
            "client": {
                "clientName": "VISIONOS",
                "clientVersion": "1.02",
                "deviceMake": "Apple",
                "deviceModel": "RealityDevice17,1",
                "hl": "en",
                "osName": "visionOS",
                "osVersion": "26.5.23O471",
                "userAgent": VISIONOS_UA,
                "visitorData": visitor_data
            }
        },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let mut req = shared_http()
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", VISIONOS_UA)
        .header("X-YouTube-Client-Name", "101")
        .header("X-YouTube-Client-Version", "1.02")
        .header("Origin", "https://www.youtube.com");

    if !visitor_data.is_empty() {
        req = req.header("X-Goog-Visitor-Id", visitor_data);
    }

    let res = req.body(payload.to_string()).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let raw = res.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let (fmt, mime_type, ext) = pick_best_audio_format(&json)?;
    build_stream_entry(video_id, fmt, mime_type, ext, WEB_UA.to_string(), false)
}

async fn resolve_with_android(video_id: &str, visitor_data: &str) -> Option<CachedYtStream> {
    let payload = serde_json::json!({
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "20.10.38",
                "androidSdkVersion": 30,
                "hl": "en",
                "gl": "US",
                "visitorData": visitor_data
            }
        },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let mut req = shared_http()
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", ANDROID_UA)
        .header("X-YouTube-Client-Name", "3")
        .header("X-YouTube-Client-Version", "20.10.38");

    if !visitor_data.is_empty() {
        req = req.header("X-Goog-Visitor-Id", visitor_data);
    }

    let res = req.body(payload.to_string()).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let raw = res.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let (fmt, mime_type, ext) = pick_best_audio_format(&json)?;
    build_stream_entry(video_id, fmt, mime_type, ext, ANDROID_UA.to_string(), true)
}

#[cfg(desktop)]
fn resolve_with_ytdlp_desktop(video_id: &str) -> Option<CachedYtStream> {
    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
    let out = std::process::Command::new("yt-dlp")
        .args(["-f", "bestaudio[ext=m4a]/bestaudio", "--no-warnings", "-j", &watch_url])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let d: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let url = d.get("url")?.as_str()?.to_string();
    let ext = d.get("ext").and_then(|e| e.as_str()).unwrap_or("m4a").to_string();
    let mime_type = if ext == "m4a" || ext == "mp4" {
        "audio/mp4".to_string()
    } else if ext == "webm" {
        "audio/webm".to_string()
    } else {
        "audio/mpeg".to_string()
    };
    let bitrate_bps = d
        .get("abr")
        .and_then(|v| v.as_f64())
        .map(|k| (k * 1000.0) as u64)
        .unwrap_or(128_000);
    let sample_rate = d
        .get("asr")
        .and_then(|v| v.as_u64())
        .unwrap_or(44_100) as u32;
    let content_length = d
        .get("filesize")
        .or_else(|| d.get("filesize_approx"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let ua = d
        .get("http_headers")
        .and_then(|h| h.get("User-Agent"))
        .and_then(|u| u.as_str())
        .unwrap_or(WEB_UA)
        .to_string();

    Some(CachedYtStream {
        video_id: video_id.to_string(),
        url,
        mime_type,
        ext,
        bitrate_bps,
        sample_rate,
        content_length,
        user_agent: ua,
        chunked_range_only: false,
        fetched_at: Instant::now(),
    })
}

pub async fn resolve_yt_stream(
    video_id: &str,
    allow_chunked_only: bool,
) -> Result<CachedYtStream, String> {
    if let Some(cached) = get_cached_stream(video_id) {
        if allow_chunked_only || !cached.chunked_range_only {
            return Ok(cached);
        }
    }

    let visitor_data = fetch_visitor_data(video_id).await;

    if let Some(stream) = resolve_with_visionos(video_id, &visitor_data).await {
        store_cached_stream(stream.clone());
        return Ok(stream);
    }

    if allow_chunked_only {
        if let Some(stream) = resolve_with_android(video_id, &visitor_data).await {
            store_cached_stream(stream.clone());
            return Ok(stream);
        }
    }

    #[cfg(desktop)]
    {
        let vid = video_id.to_string();
        if let Ok(Some(stream)) =
            tauri::async_runtime::spawn_blocking(move || resolve_with_ytdlp_desktop(&vid)).await
        {
            store_cached_stream(stream.clone());
            return Ok(stream);
        }
    }

    Err(format!("Unable to extract direct audio stream for {video_id}"))
}

pub async fn try_resolve_candidates(
    video_ids: &[String],
    allow_chunked_only: bool,
) -> Option<CachedYtStream> {
    for vid in video_ids.iter().take(4) {
        if let Ok(stream) = resolve_yt_stream(vid, allow_chunked_only).await {
            return Some(stream);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_ids_finds_video_renderer_entries() {
        let html = r#"{"videoRenderer":{"videoId":"BddP6PYo2gs"}},"videoId":"4NRXx6U8ABQ""#;
        let ids = extract_video_ids(html, 5);
        assert_eq!(ids, vec!["BddP6PYo2gs", "4NRXx6U8ABQ"]);
    }
}
