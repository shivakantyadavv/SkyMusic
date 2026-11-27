use lofty::config::WriteOptions;
use lofty::picture::{Picture, PictureType};
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Tag, TagType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use symphonia::core::codecs::{
    CODEC_TYPE_AAC, CODEC_TYPE_ALAC, CODEC_TYPE_FLAC, CODEC_TYPE_MP3, CODEC_TYPE_OPUS,
    CODEC_TYPE_PCM_ALAW, CODEC_TYPE_PCM_F32BE, CODEC_TYPE_PCM_F32LE, CODEC_TYPE_PCM_MULAW,
    CODEC_TYPE_PCM_S16BE, CODEC_TYPE_PCM_S16LE, CODEC_TYPE_PCM_S24BE, CODEC_TYPE_PCM_S24LE,
    CODEC_TYPE_PCM_S32LE, CODEC_TYPE_PCM_U8, CODEC_TYPE_VORBIS,
};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::{Emitter, Manager};

use crate::yt_stream::{search_youtube_ids_internal, shared_http, try_resolve_candidates};

pub struct BridgePort(pub u16);

#[derive(Default)]
pub struct LocalFileRegistry(pub Mutex<HashMap<String, PathBuf>>);

impl LocalFileRegistry {
    pub fn register_path(&self, path: &Path) -> String {
        let raw = path.to_string_lossy().to_string();
        let mut hash: u64 = 0xcbf29ce484222325;
        for b in raw.as_bytes() {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        let id = format!("loc_{hash:016x}");
        if let Ok(mut guard) = self.0.lock() {
            guard.insert(id.clone(), path.to_path_buf());
        }
        id
    }

    pub fn get_path(&self, id: &str) -> Option<PathBuf> {
        self.0.lock().ok()?.get(id).cloned()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioQualityInfo {
    pub badge: String,
    pub detail: String,
    pub codec: Option<String>,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate_hz: Option<u32>,
    pub bit_depth: Option<u32>,
    pub tier: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAudioRegistration {
    pub id: String,
    pub file_path: String,
    pub stream_url: String,
    pub duration: u64,
    pub quality: AudioQualityInfo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtPlaybackStreamResult {
    pub video_id: String,
    pub stream_url: String,
    pub mime_type: String,
    pub bitrate_kbps: u32,
    pub sample_rate_hz: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub track_id: String,
    pub progress: u8,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedTrackResult {
    pub track_id: String,
    pub file_path: String,
    pub file_name: String,
    pub local_stream_url: String,
    pub mime_type: String,
    pub quality: AudioQualityInfo,
    pub duration: u64,
}

fn codec_label_from_symphonia(codec_type: symphonia::core::codecs::CodecType, ext: &str) -> String {
    if codec_type == CODEC_TYPE_FLAC {
        "FLAC".to_string()
    } else if codec_type == CODEC_TYPE_ALAC {
        "ALAC".to_string()
    } else if codec_type == CODEC_TYPE_MP3 {
        "MP3".to_string()
    } else if codec_type == CODEC_TYPE_AAC {
        "AAC".to_string()
    } else if codec_type == CODEC_TYPE_VORBIS {
        "Vorbis".to_string()
    } else if codec_type == CODEC_TYPE_OPUS {
        "Opus".to_string()
    } else if codec_type == CODEC_TYPE_PCM_S16LE
        || codec_type == CODEC_TYPE_PCM_S24LE
        || codec_type == CODEC_TYPE_PCM_S32LE
        || codec_type == CODEC_TYPE_PCM_S16BE
        || codec_type == CODEC_TYPE_PCM_S24BE
        || codec_type == CODEC_TYPE_PCM_F32LE
        || codec_type == CODEC_TYPE_PCM_F32BE
        || codec_type == CODEC_TYPE_PCM_U8
        || codec_type == CODEC_TYPE_PCM_ALAW
        || codec_type == CODEC_TYPE_PCM_MULAW
    {
        if ext == "wav" {
            "WAV".to_string()
        } else {
            "PCM".to_string()
        }
    } else {
        ext.to_uppercase()
    }
}

fn format_sample_rate_khz(sr: u32) -> String {
    if sr % 1000 == 0 {
        format!("{}kHz", sr / 1000)
    } else {
        format!("{:.1}kHz", sr as f64 / 1000.0)
    }
}

pub fn inspect_audio_file(path: &Path, is_downloaded_hq: bool) -> (AudioQualityInfo, u64) {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let file_size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let mut codec: Option<String> = None;
    let mut sample_rate: Option<u32> = None;
    let mut bit_depth: Option<u32> = None;
    let mut bitrate_kbps: Option<u32> = None;
    let mut duration_secs: u64 = 0;

    // 1. Inspect stream codec & sample params with Symphonia
    if let Ok(file) = File::open(path) {
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if !ext.is_empty() {
            hint.with_extension(&ext);
        }
        if let Ok(probed) = symphonia::default::get_probe().format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        ) {
            if let Some(track) = probed.format.default_track() {
                let cp = &track.codec_params;
                codec = Some(codec_label_from_symphonia(cp.codec, &ext));
                sample_rate = cp.sample_rate;
                bit_depth = cp.bits_per_sample;
                if let (Some(n_frames), Some(tb)) = (cp.n_frames, cp.time_base) {
                    let time = tb.calc_time(n_frames);
                    duration_secs = time.seconds;
                }
            }
        }
    }

    // 2. Supplement container bitrate / duration with Lofty
    if let Ok(tagged) = Probe::open(path).and_then(|p| p.read()) {
        let props = tagged.properties();
        if bitrate_kbps.is_none() {
            bitrate_kbps = props.audio_bitrate().or_else(|| props.overall_bitrate());
        }
        if sample_rate.is_none() {
            sample_rate = props.sample_rate();
        }
        if bit_depth.is_none() {
            bit_depth = props.bit_depth().map(|b| b as u32);
        }
        if duration_secs == 0 {
            duration_secs = props.duration().as_secs();
        }
    }

    if bitrate_kbps.is_none() && duration_secs > 0 && file_size_bytes > 0 {
        let est = ((file_size_bytes * 8) / duration_secs / 1000) as u32;
        if est > 0 {
            bitrate_kbps = Some(est);
        }
    }

    let resolved_codec = codec.unwrap_or_else(|| {
        if ext.is_empty() {
            "AUDIO".to_string()
        } else {
            ext.to_ascii_uppercase()
        }
    });

    if is_downloaded_hq {
        let sr_txt = sample_rate
            .map(format_sample_rate_khz)
            .unwrap_or_else(|| "44.1kHz".to_string());
        return (
            AudioQualityInfo {
                badge: "HQ 320kbps".to_string(),
                detail: format!("{resolved_codec} • {sr_txt} • 320kbps Offline HQ"),
                codec: Some(resolved_codec),
                bitrate_kbps: Some(bitrate_kbps.unwrap_or(256).max(256)),
                sample_rate_hz: sample_rate,
                bit_depth,
                tier: "hq".to_string(),
            },
            duration_secs,
        );
    }

    let is_lossless = ext == "flac" || ext == "wav" || ext == "alac" || resolved_codec == "FLAC" || resolved_codec == "WAV" || resolved_codec == "ALAC";

    if is_lossless {
        let format_name = if ext == "wav" { "WAV" } else { resolved_codec.as_str() };
        let detail = match (bit_depth, sample_rate) {
            (Some(bd), Some(sr)) => format!("{format_name} • {bd}-bit/{} Lossless", format_sample_rate_khz(sr)),
            (None, Some(sr)) => format!("{format_name} • {} Lossless", format_sample_rate_khz(sr)),
            _ => format!("{format_name} • Lossless"),
        };
        return (
            AudioQualityInfo {
                badge: "LOSSLESS".to_string(),
                detail,
                codec: Some(format_name.to_string()),
                bitrate_kbps,
                sample_rate_hz: sample_rate,
                bit_depth,
                tier: "lossless".to_string(),
            },
            duration_secs,
        );
    }

    let kbps = bitrate_kbps.unwrap_or(192);
    let badge = if kbps >= 220 {
        "HQ".to_string()
    } else {
        resolved_codec.clone()
    };
    let sr_suffix = sample_rate
        .map(|s| format!(" • {}", format_sample_rate_khz(s)))
        .unwrap_or_default();
    let detail = if bitrate_kbps.is_some() {
        format!("{resolved_codec} • {kbps} kbps{sr_suffix}")
    } else {
        format!("{resolved_codec}{sr_suffix}")
    };

    (
        AudioQualityInfo {
            badge,
            detail,
            codec: Some(resolved_codec),
            bitrate_kbps,
            sample_rate_hz: sample_rate,
            bit_depth,
            tier: if kbps >= 220 { "hq" } else { "unknown" }.to_string(),
        },
        duration_secs,
    )
}

pub fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "m4a" | "mp4" | "aac" => "audio/mp4",
        "ogg" | "oga" => "audio/ogg",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

fn sanitize_filename(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => ' ',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "track".to_string()
    } else {
        trimmed.chars().take(90).collect()
    }
}

fn resolve_download_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(audio_dir) = app.path().audio_dir() {
        let dir = audio_dir.join("Skymusic");
        if std::fs::create_dir_all(&dir).is_ok() {
            let probe_file = dir.join(".sky_write_probe");
            if std::fs::write(&probe_file, b"ok").is_ok() {
                let _ = std::fs::remove_file(&probe_file);
                return Ok(dir);
            }
        }
    }

    let fallback = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve download folder: {e}"))?
        .join("Music")
        .join("Skymusic");
    std::fs::create_dir_all(&fallback)
        .map_err(|e| format!("Failed to create download folder: {e}"))?;
    Ok(fallback)
}

fn emit_dl_progress(
    app: &tauri::AppHandle,
    track_id: &str,
    progress: u8,
    status: &str,
    error: Option<String>,
) {
    let _ = app.emit(
        "track-download-progress",
        DownloadProgressEvent {
            track_id: track_id.to_string(),
            progress,
            status: status.to_string(),
            error,
        },
    );
}

async fn download_stream_to_file(
    app: &tauri::AppHandle,
    track_id: &str,
    url: &str,
    user_agent: &str,
    content_length: u64,
    chunked_range_only: bool,
    dest_part: &Path,
) -> Result<(), String> {
    let client = shared_http();
    let mut file = File::create(dest_part).map_err(|e| format!("Create file failed: {e}"))?;

    if !chunked_range_only {
        let res = client
            .get(url)
            .header("User-Agent", user_agent)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {e}"))?;

        if res.status().is_success() {
            let total = res.content_length().unwrap_or(content_length);
            let mut downloaded: u64 = 0;
            let mut last_pct: u8 = 10;
            let mut res = res;
            while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
                file.write_all(&chunk).map_err(|e| e.to_string())?;
                downloaded += chunk.len() as u64;
                if total > 0 {
                    let pct = (10.0 + (downloaded as f64 / total as f64) * 76.0).min(86.0) as u8;
                    if pct > last_pct {
                        last_pct = pct;
                        emit_dl_progress(app, track_id, pct, "downloading", None);
                    }
                }
            }
            file.flush().map_err(|e| e.to_string())?;
            if downloaded > 1024 {
                return Ok(());
            }
        }
    }

    // Chunked `&range=start-end` fallback (Android InnerTube / range-gated CDNs)
    drop(file);
    let mut file = File::create(dest_part).map_err(|e| format!("Create chunk file failed: {e}"))?;
    let total = if content_length > 0 {
        content_length
    } else {
        15 * 1024 * 1024
    };
    let chunk_size: u64 = 524_288;
    let mut offset: u64 = 0;
    let sep = if url.contains('?') { '&' } else { '?' };

    while offset < total {
        let end = (offset + chunk_size - 1).min(total - 1);
        let chunk_url = format!("{url}{sep}range={offset}-{end}");
        let res = client
            .get(&chunk_url)
            .header("User-Agent", user_agent)
            .send()
            .await
            .map_err(|e| format!("Chunk request failed: {e}"))?;

        if !res.status().is_success() {
            if offset > 0 {
                break;
            }
            return Err(format!("Download blocked with HTTP {}", res.status()));
        }

        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        if bytes.is_empty() {
            break;
        }
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        offset += bytes.len() as u64;
        let pct = (10.0 + (offset as f64 / total as f64) * 76.0).min(86.0) as u8;
        emit_dl_progress(app, track_id, pct, "downloading", None);

        if (bytes.len() as u64) < (end - (offset - bytes.len() as u64) + 1) && content_length == 0 {
            break;
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

async fn embed_metadata_and_artwork(
    path: &Path,
    title: &str,
    artist: &str,
    album: &str,
    album_art_url: &str,
) {
    let cover_bytes = if !album_art_url.is_empty() {
        shared_http()
            .get(album_art_url)
            .send()
            .await
            .ok()
            .filter(|r| r.status().is_success())
            .and_then(|r| Some(r))
    } else {
        None
    };

    let raw_cover = match cover_bytes {
        Some(res) => res.bytes().await.ok().map(|b| b.to_vec()),
        None => None,
    };

    let path_buf = path.to_path_buf();
    let title = title.to_string();
    let artist = artist.to_string();
    let album = album.to_string();

    let _ = tauri::async_runtime::spawn_blocking(move || {
        let Ok(probe) = Probe::open(&path_buf) else {
            return;
        };
        let Ok(mut tagged_file) = probe.read() else {
            return;
        };

        let tag_type = match path_buf
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "m4a" | "mp4" => TagType::Mp4Ilst,
            "mp3" => TagType::Id3v2,
            "flac" => TagType::VorbisComments,
            _ => tagged_file.primary_tag_type(),
        };

        if tagged_file.primary_tag_mut().is_none() {
            tagged_file.insert_tag(Tag::new(tag_type));
        }

        if let Some(tag) = tagged_file.primary_tag_mut() {
            tag.set_title(title);
            tag.set_artist(artist);
            tag.set_album(album);

            if let Some(bytes) = raw_cover {
                let mut reader = Cursor::new(bytes);
                if let Ok(mut pic) = Picture::from_reader(&mut reader) {
                    pic.set_pic_type(PictureType::CoverFront);
                    tag.push_picture(pic);
                }
            }

            let _ = tagged_file.save_to_path(&path_buf, WriteOptions::default());
        }
    })
    .await;
}

#[tauri::command]
pub async fn register_local_audio(
    registry: tauri::State<'_, LocalFileRegistry>,
    bridge_port: tauri::State<'_, BridgePort>,
    path: String,
    is_downloaded_hq: Option<bool>,
) -> Result<LocalAudioRegistration, String> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(format!("Audio file not found: {path}"));
    }
    let dl_hq = is_downloaded_hq.unwrap_or(false);
    let pb_clone = pb.clone();
    let (quality, duration) =
        tauri::async_runtime::spawn_blocking(move || inspect_audio_file(&pb_clone, dl_hq))
            .await
            .map_err(|e| e.to_string())?;

    let id = registry.register_path(&pb);
    let port = bridge_port.0;
    Ok(LocalAudioRegistration {
        id: id.clone(),
        file_path: path,
        stream_url: format!("http://127.0.0.1:{port}/local?id={id}"),
        duration,
        quality,
    })
}

#[tauri::command]
pub async fn resolve_yt_playback_url(
    bridge_port: tauri::State<'_, BridgePort>,
    video_ids: Vec<String>,
) -> Result<Option<YtPlaybackStreamResult>, String> {
    // Only use non-chunked HTTP streams (VISIONOS / yt-dlp) for direct HTML5 Audio seeking + Atmos DSP
    let Some(stream) = try_resolve_candidates(&video_ids, false).await else {
        return Ok(None);
    };

    let port = bridge_port.0;
    Ok(Some(YtPlaybackStreamResult {
        video_id: stream.video_id.clone(),
        stream_url: format!("http://127.0.0.1:{port}/stream?v={}", stream.video_id),
        mime_type: stream.mime_type,
        bitrate_kbps: (stream.bitrate_bps / 1000).max(128) as u32,
        sample_rate_hz: stream.sample_rate,
    }))
}

#[tauri::command]
pub async fn download_track_hq(
    app: tauri::AppHandle,
    registry: tauri::State<'_, LocalFileRegistry>,
    bridge_port: tauri::State<'_, BridgePort>,
    track_id: String,
    title: String,
    artist: String,
    album: String,
    album_art: String,
    preview_url: Option<String>,
) -> Result<DownloadedTrackResult, String> {
    emit_dl_progress(&app, &track_id, 5, "resolving", None);

    let clean_title = title.trim();
    let primary_query = format!("{clean_title} {artist} official audio");
    let mut ids = search_youtube_ids_internal(&primary_query)
        .await
        .unwrap_or_default();
    if ids.is_empty() {
        let fallback_query = format!("{clean_title} {artist}");
        ids = search_youtube_ids_internal(&fallback_query)
            .await
            .unwrap_or_default();
    }

    let resolved = try_resolve_candidates(&ids, true).await;

    let (dl_url, dl_ua, dl_len, dl_chunked, ext, mime_type) = if let Some(s) = resolved {
        (
            s.url,
            s.user_agent,
            s.content_length,
            s.chunked_range_only,
            s.ext,
            s.mime_type,
        )
    } else if let Some(fallback) = preview_url.filter(|u| !u.is_empty()) {
        (
            fallback,
            "Mozilla/5.0".to_string(),
            0,
            false,
            "mp3".to_string(),
            "audio/mpeg".to_string(),
        )
    } else {
        emit_dl_progress(
            &app,
            &track_id,
            0,
            "error",
            Some("Could not resolve downloadable audio stream.".to_string()),
        );
        return Err("Could not resolve downloadable audio stream.".to_string());
    };

    emit_dl_progress(&app, &track_id, 10, "downloading", None);

    let dir = resolve_download_dir(&app)?;
    let safe_base = sanitize_filename(&format!("{artist} - {title}"));
    let file_name = format!("{safe_base}.{ext}");
    let dest_path = dir.join(&file_name);
    let part_path = dir.join(format!("{safe_base}.{ext}.part"));

    if let Err(err) = download_stream_to_file(
        &app,
        &track_id,
        &dl_url,
        &dl_ua,
        dl_len,
        dl_chunked,
        &part_path,
    )
    .await
    {
        let _ = std::fs::remove_file(&part_path);
        emit_dl_progress(&app, &track_id, 0, "error", Some(err.clone()));
        return Err(err);
    }

    if dest_path.exists() {
        let _ = std::fs::remove_file(&dest_path);
    }
    std::fs::rename(&part_path, &dest_path)
        .map_err(|e| format!("Failed saving downloaded file: {e}"))?;

    emit_dl_progress(&app, &track_id, 90, "tagging", None);
    embed_metadata_and_artwork(&dest_path, &title, &artist, &album, &album_art).await;

    let dest_clone = dest_path.clone();
    let (quality, duration) =
        tauri::async_runtime::spawn_blocking(move || inspect_audio_file(&dest_clone, true))
            .await
            .map_err(|e| e.to_string())?;

    let id = registry.register_path(&dest_path);
    let local_stream_url = format!("http://127.0.0.1:{}/local?id={id}", bridge_port.0);

    emit_dl_progress(&app, &track_id, 100, "completed", None);

    Ok(DownloadedTrackResult {
        track_id,
        file_path: dest_path.to_string_lossy().to_string(),
        file_name,
        local_stream_url,
        mime_type,
        quality,
        duration,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_illegal_chars() {
        assert_eq!(sanitize_filename("Artist: One / Two?"), "Artist_ One _ Two_");
        assert_eq!(sanitize_filename("..."), "track");
    }

    #[test]
    fn inspect_wav_metadata_reports_lossless() {
        let mut path = std::env::temp_dir();
        path.push("skymusic_test_sample.wav");
        // Write 1 second of 16-bit 44.1kHz stereo PCM WAV
        let data_size: u32 = 44100 * 4;
        let riff_size: u32 = 36 + data_size;
        let mut wav = Vec::with_capacity(44 + data_size as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&riff_size.to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&44100u32.to_le_bytes());
        wav.extend_from_slice(&(44100u32 * 4).to_le_bytes());
        wav.extend_from_slice(&4u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        wav.resize(44 + data_size as usize, 0);
        std::fs::write(&path, &wav).expect("write test wav");

        let (q, dur) = inspect_audio_file(&path, false);
        let _ = std::fs::remove_file(&path);
        assert_eq!(q.tier, "lossless");
        assert_eq!(q.badge, "LOSSLESS");
        assert_eq!(q.sample_rate_hz, Some(44100));
        assert_eq!(q.bit_depth, Some(16));
        assert_eq!(dur, 1);
    }
}
