use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const LAN_UDP_PORT: u16 = 45781;
pub const LAN_HTTP_PORT: u16 = 45782;
const MAX_HTTP_BODY_BYTES: usize = 4 * 1024 * 1024;
const PEER_TTL_MS: u64 = 20_000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LanNowPlayingSummary {
    pub title: String,
    pub artist: String,
    pub artwork: Option<String>,
    pub track_id: Option<String>,
    pub is_playing: bool,
    pub position: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub app_version: String,
    pub ip: String,
    pub port: u16,
    pub room_id: Option<String>,
    pub requires_pin: bool,
    pub now_playing: Option<LanNowPlayingSummary>,
    pub updated_at: u64,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanBeaconPacket {
    pub magic: String,
    pub kind: String,
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub app_version: String,
    pub port: u16,
    pub room_id: Option<String>,
    pub requires_pin: bool,
    pub now_playing: Option<LanNowPlayingSummary>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanCastCommand {
    pub action: String,
    pub from_device_id: String,
    pub from_device_name: String,
    pub track: Option<Value>,
    pub queue: Option<Vec<Value>>,
    pub position: Option<f64>,
    pub volume: Option<f64>,
    pub muted: Option<bool>,
    pub atmos_preset: Option<String>,
    pub pin: Option<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDiscoveryResult {
    pub self_info: LanDeviceInfo,
    pub peers: Vec<LanDeviceInfo>,
}

struct LanInner {
    device_id: String,
    device_name: String,
    platform: String,
    app_version: String,
    lan_port: u16,
    room_id: Option<String>,
    lan_pin: Option<String>,
    now_playing: Option<LanNowPlayingSummary>,
    snapshot_json: Option<Value>,
    snapshot_updated_at: u64,
    peers: HashMap<String, LanDeviceInfo>,
    local_ips: Vec<String>,
}

#[derive(Clone)]
pub struct LanSyncState {
    inner: Arc<Mutex<LanInner>>,
    udp_sender: Arc<Mutex<Option<UdpSocket>>>,
}

impl LanSyncState {
    pub fn new(app_version: String, lan_port: u16) -> Self {
        let local_ips = detect_local_ipv4s();
        let primary_ip = local_ips.first().cloned().unwrap_or_else(|| "127.0.0.1".to_string());
        let fallback_id = format!("dev-{}", now_ms());
        let inner = LanInner {
            device_id: fallback_id,
            device_name: default_device_name(),
            platform: default_platform(),
            app_version,
            lan_port,
            room_id: None,
            lan_pin: None,
            now_playing: None,
            snapshot_json: None,
            snapshot_updated_at: 0,
            peers: HashMap::new(),
            local_ips: if local_ips.is_empty() {
                vec![primary_ip]
            } else {
                local_ips
            },
        };
        Self {
            inner: Arc::new(Mutex::new(inner)),
            udp_sender: Arc::new(Mutex::new(None)),
        }
    }

    fn self_info(&self) -> LanDeviceInfo {
        let guard = self.inner.lock().unwrap();
        let ip = guard
            .local_ips
            .first()
            .cloned()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        LanDeviceInfo {
            device_id: guard.device_id.clone(),
            device_name: guard.device_name.clone(),
            platform: guard.platform.clone(),
            app_version: guard.app_version.clone(),
            ip,
            port: guard.lan_port,
            room_id: guard.room_id.clone(),
            requires_pin: guard
                .lan_pin
                .as_ref()
                .map(|p| !p.trim().is_empty())
                .unwrap_or(false),
            now_playing: guard.now_playing.clone(),
            updated_at: guard.snapshot_updated_at,
            last_seen_ms: now_ms(),
        }
    }

    fn refresh_local_ips(&self) {
        let ips = detect_local_ipv4s();
        if !ips.is_empty() {
            let mut guard = self.inner.lock().unwrap();
            guard.local_ips = ips;
        }
    }

    fn make_beacon(&self, kind: &str) -> LanBeaconPacket {
        let guard = self.inner.lock().unwrap();
        LanBeaconPacket {
            magic: "SKYMUSIC_LAN_V1".to_string(),
            kind: kind.to_string(),
            device_id: guard.device_id.clone(),
            device_name: guard.device_name.clone(),
            platform: guard.platform.clone(),
            app_version: guard.app_version.clone(),
            port: guard.lan_port,
            room_id: guard.room_id.clone(),
            requires_pin: guard
                .lan_pin
                .as_ref()
                .map(|p| !p.trim().is_empty())
                .unwrap_or(false),
            now_playing: guard.now_playing.clone(),
            updated_at: guard.snapshot_updated_at,
        }
    }

    fn check_pin(&self, supplied: Option<&str>) -> bool {
        let guard = self.inner.lock().unwrap();
        match guard.lan_pin.as_deref() {
            Some(expected) if !expected.trim().is_empty() => {
                supplied.map(|s| s.trim() == expected.trim()).unwrap_or(false)
            }
            _ => true,
        }
    }

    fn upsert_peer(&self, mut peer: LanDeviceInfo) {
        let mut guard = self.inner.lock().unwrap();
        if peer.device_id == guard.device_id {
            return;
        }
        peer.last_seen_ms = now_ms();
        guard.peers.insert(peer.device_id.clone(), peer);
    }

    fn active_peers(&self) -> Vec<LanDeviceInfo> {
        let now = now_ms();
        let mut guard = self.inner.lock().unwrap();
        guard
            .peers
            .retain(|_, p| now.saturating_sub(p.last_seen_ms) <= PEER_TTL_MS);
        let mut list: Vec<LanDeviceInfo> = guard.peers.values().cloned().collect();
        list.sort_by(|a, b| a.device_name.cmp(&b.device_name));
        list
    }

    pub fn broadcast_beacon(&self, kind: &str) {
        self.refresh_local_ips();
        let beacon = self.make_beacon(kind);
        let Ok(payload) = serde_json::to_vec(&beacon) else {
            return;
        };
        let local_ips = {
            let guard = self.inner.lock().unwrap();
            guard.local_ips.clone()
        };

        let targets = build_broadcast_targets(&local_ips, LAN_UDP_PORT);
        let sender_guard = self.udp_sender.lock().unwrap();
        if let Some(sock) = sender_guard.as_ref() {
            for target in targets {
                let _ = sock.send_to(&payload, target);
            }
        }
    }
}

fn default_platform() -> String {
    if cfg!(target_os = "android") {
        "mobile".to_string()
    } else {
        "desktop".to_string()
    }
}

fn default_device_name() -> String {
    if let Ok(name) = std::env::var("COMPUTERNAME") {
        if !name.trim().is_empty() {
            return name;
        }
    }
    if let Ok(name) = std::env::var("HOSTNAME") {
        if !name.trim().is_empty() {
            return name;
        }
    }
    if cfg!(target_os = "android") {
        "Android Device".to_string()
    } else {
        "Skymusic Desktop".to_string()
    }
}

pub fn detect_local_ipv4s() -> Vec<String> {
    let mut ips: Vec<String> = Vec::new();
    let probe_targets = [
        "192.168.1.1:80",
        "192.168.0.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
        "8.8.8.8:80",
        "1.1.1.1:80",
    ];
    for target in probe_targets {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect(target).is_ok() {
                if let Ok(SocketAddr::V4(addr)) = sock.local_addr() {
                    let ip = *addr.ip();
                    if !ip.is_loopback() && !ip.is_unspecified() && is_private_or_lan_ipv4(ip) {
                        let s = ip.to_string();
                        if !ips.contains(&s) {
                            ips.push(s);
                        }
                    }
                }
            }
        }
    }
    // Fallback if no default route matched LAN range cleanly
    if ips.is_empty() {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect("8.8.8.8:80").is_ok() {
                if let Ok(SocketAddr::V4(addr)) = sock.local_addr() {
                    let ip = *addr.ip();
                    if !ip.is_loopback() && !ip.is_unspecified() {
                        ips.push(ip.to_string());
                    }
                }
            }
        }
    }
    ips
}

fn is_private_or_lan_ipv4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    // 10.0.0.0/8, 172.16.0.0/12 (skip WSL/Docker common 172.17+ only if non-private, allow all RFC1918), 192.168.0.0/16
    o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168)
}

pub fn build_broadcast_targets(local_ips: &[String], port: u16) -> Vec<SocketAddr> {
    let mut out = vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::BROADCAST), port)];
    for raw in local_ips {
        if let Ok(v4) = raw.parse::<Ipv4Addr>() {
            let o = v4.octets();
            let bcast = Ipv4Addr::new(o[0], o[1], o[2], 255);
            let addr = SocketAddr::new(IpAddr::V4(bcast), port);
            if !out.contains(&addr) {
                out.push(addr);
            }
        }
    }
    out
}

pub fn start_lan_sync_service(app: AppHandle) -> LanSyncState {
    let listener = TcpListener::bind(("0.0.0.0", LAN_HTTP_PORT))
        .or_else(|_| TcpListener::bind(("0.0.0.0", 0)))
        .expect("failed to bind Skymusic LAN sync HTTP listener");
    let lan_port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let version = app.package_info().version.to_string();
    let state = LanSyncState::new(version, lan_port);

    // HTTP accept loop
    {
        let app_clone = app.clone();
        let state_clone = state.clone();
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else {
                    continue;
                };
                let app_h = app_clone.clone();
                let st = state_clone.clone();
                thread::spawn(move || handle_lan_http(stream, app_h, st));
            }
        });
    }

    // UDP discovery listener + periodic broadcaster
    let recv_socket = UdpSocket::bind(("0.0.0.0", LAN_UDP_PORT))
        .or_else(|_| UdpSocket::bind(("0.0.0.0", 0)))
        .ok();

    if let Some(sock) = recv_socket {
        let _ = sock.set_broadcast(true);
        let _ = sock.set_read_timeout(Some(Duration::from_millis(1200)));
        if let Ok(cloned_sender) = sock.try_clone() {
            let _ = cloned_sender.set_broadcast(true);
            *state.udp_sender.lock().unwrap() = Some(cloned_sender);
        } else if let Ok(fallback) = UdpSocket::bind("0.0.0.0:0") {
            let _ = fallback.set_broadcast(true);
            *state.udp_sender.lock().unwrap() = Some(fallback);
        }

        // Listener thread
        {
            let state_rx = state.clone();
            let app_rx = app.clone();
            thread::spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    match sock.recv_from(&mut buf) {
                        Ok((len, src)) => {
                            let Ok(packet) = serde_json::from_slice::<LanBeaconPacket>(&buf[..len])
                            else {
                                continue;
                            };
                            if packet.magic != "SKYMUSIC_LAN_V1" || packet.port == 0 {
                                continue;
                            }
                            let src_ip = src.ip().to_string();
                            let is_self = {
                                let guard = state_rx.inner.lock().unwrap();
                                packet.device_id == guard.device_id
                            };
                            if is_self {
                                continue;
                            }
                            let peer = LanDeviceInfo {
                                device_id: packet.device_id.clone(),
                                device_name: packet.device_name.clone(),
                                platform: packet.platform.clone(),
                                app_version: packet.app_version.clone(),
                                ip: src_ip.clone(),
                                port: packet.port,
                                room_id: packet.room_id.clone(),
                                requires_pin: packet.requires_pin,
                                now_playing: packet.now_playing.clone(),
                                updated_at: packet.updated_at,
                                last_seen_ms: now_ms(),
                            };
                            state_rx.upsert_peer(peer);

                            if packet.kind == "probe" {
                                let reply = state_rx.make_beacon("hello");
                                if let Ok(bytes) = serde_json::to_vec(&reply) {
                                    let _ = sock.send_to(&bytes, src);
                                    let _ = sock.send_to(
                                        &bytes,
                                        SocketAddr::new(src.ip(), LAN_UDP_PORT),
                                    );
                                }
                            }
                            let _ = app_rx.emit("lan-peers-updated", state_rx.active_peers());
                        }
                        Err(_) => {
                            // Timeout / temporary error; keep listening
                        }
                    }
                }
            });
        }

        // Periodic broadcaster thread
        {
            let state_tx = state.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(900));
                state_tx.broadcast_beacon("probe");
                loop {
                    thread::sleep(Duration::from_secs(4));
                    state_tx.broadcast_beacon("hello");
                }
            });
        }
    }

    state
}

fn write_json_response(stream: &mut TcpStream, status: &str, body: &Value) {
    let raw = serde_json::to_vec(body).unwrap_or_else(|_| b"{}".to_vec());
    let header = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Content-Type, X-Skymusic-Pin\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\
         Content-Length: {}\r\n\r\n",
        raw.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(&raw);
    let _ = stream.flush();
}

fn handle_lan_http(mut stream: TcpStream, app: AppHandle, state: LanSyncState) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let peer_ip = stream
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_default();

    let Ok(cloned) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(cloned);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_target = parts.next().unwrap_or("/");
    let path = raw_target.split('?').next().unwrap_or("/");

    let mut content_length: usize = 0;
    let mut pin_header: Option<String> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let val = v.trim();
            if key == "content-length" {
                content_length = val.parse::<usize>().unwrap_or(0).min(MAX_HTTP_BODY_BYTES);
            } else if key == "x-skymusic-pin" && !val.is_empty() {
                pin_header = Some(val.to_string());
            }
        }
    }

    if method == "OPTIONS" {
        write_json_response(&mut stream, "204 No Content", &serde_json::json!({}));
        return;
    }

    let body_bytes = if content_length > 0 {
        let mut buf = vec![0u8; content_length];
        if reader.read_exact(&mut buf).is_err() {
            write_json_response(
                &mut stream,
                "400 Bad Request",
                &serde_json::json!({ "error": "incomplete request body" }),
            );
            return;
        }
        Some(buf)
    } else {
        None
    };

    match (method, path) {
        ("GET", "/lan/info") => {
            let info = state.self_info();
            write_json_response(
                &mut stream,
                "200 OK",
                &serde_json::to_value(info).unwrap_or_default(),
            );
        }
        ("POST", "/lan/ping") => {
            if let Some(bytes) = body_bytes.as_deref() {
                if let Ok(mut peer) = serde_json::from_slice::<LanDeviceInfo>(bytes) {
                    if !peer_ip.is_empty() {
                        peer.ip = peer_ip;
                    }
                    state.upsert_peer(peer);
                    let _ = app.emit("lan-peers-updated", state.active_peers());
                }
            }
            let info = state.self_info();
            write_json_response(
                &mut stream,
                "200 OK",
                &serde_json::to_value(info).unwrap_or_default(),
            );
        }
        ("GET", "/lan/state") => {
            if !state.check_pin(pin_header.as_deref()) {
                write_json_response(
                    &mut stream,
                    "403 Forbidden",
                    &serde_json::json!({ "error": "Invalid Wi-Fi Sync PIN" }),
                );
                return;
            }
            let snap = {
                let guard = state.inner.lock().unwrap();
                guard.snapshot_json.clone()
            };
            write_json_response(
                &mut stream,
                "200 OK",
                &serde_json::json!({
                    "info": state.self_info(),
                    "snapshot": snap
                }),
            );
        }
        ("POST", "/lan/state") => {
            let Some(bytes) = body_bytes.as_deref() else {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &serde_json::json!({ "error": "missing body" }),
                );
                return;
            };
            let Ok(payload) = serde_json::from_slice::<Value>(bytes) else {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &serde_json::json!({ "error": "invalid json" }),
                );
                return;
            };
            let body_pin = payload.get("pin").and_then(|v| v.as_str());
            if !state.check_pin(pin_header.as_deref().or(body_pin)) {
                write_json_response(
                    &mut stream,
                    "403 Forbidden",
                    &serde_json::json!({ "error": "Invalid Wi-Fi Sync PIN" }),
                );
                return;
            }
            if let Some(mut sender_info) = payload
                .get("senderInfo")
                .and_then(|v| serde_json::from_value::<LanDeviceInfo>(v.clone()).ok())
            {
                if !peer_ip.is_empty() {
                    sender_info.ip = peer_ip;
                }
                state.upsert_peer(sender_info);
            }
            if let Some(incoming_snap) = payload.get("snapshot") {
                let _ = app.emit("lan-sync-received", incoming_snap);
            }
            let local_snap = {
                let guard = state.inner.lock().unwrap();
                guard.snapshot_json.clone()
            };
            write_json_response(
                &mut stream,
                "200 OK",
                &serde_json::json!({
                    "info": state.self_info(),
                    "snapshot": local_snap
                }),
            );
        }
        ("POST", "/lan/control") => {
            let Some(bytes) = body_bytes.as_deref() else {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &serde_json::json!({ "error": "missing command body" }),
                );
                return;
            };
            let Ok(cmd) = serde_json::from_slice::<LanCastCommand>(bytes) else {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &serde_json::json!({ "error": "invalid cast command" }),
                );
                return;
            };
            if !state.check_pin(pin_header.as_deref().or(cmd.pin.as_deref())) {
                write_json_response(
                    &mut stream,
                    "403 Forbidden",
                    &serde_json::json!({ "error": "Invalid Wi-Fi Sync PIN" }),
                );
                return;
            }
            let _ = app.emit("lan-cast-command", &cmd);
            write_json_response(
                &mut stream,
                "200 OK",
                &serde_json::json!({ "ok": true, "info": state.self_info() }),
            );
        }
        _ => {
            write_json_response(
                &mut stream,
                "404 Not Found",
                &serde_json::json!({ "error": "not found" }),
            );
        }
    }
}

fn lan_http_client() -> Result<tauri_plugin_http::reqwest::Client, String> {
    tauri_plugin_http::reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn init_lan_sync(
    state: tauri::State<'_, LanSyncState>,
    device_id: String,
    device_name: String,
    platform: String,
    room_id: Option<String>,
    lan_pin: Option<String>,
) -> LanDeviceInfo {
    {
        let mut guard = state.inner.lock().unwrap();
        if !device_id.trim().is_empty() {
            guard.device_id = device_id.trim().to_string();
        }
        if !device_name.trim().is_empty() {
            guard.device_name = device_name.trim().to_string();
        }
        if !platform.trim().is_empty() {
            guard.platform = platform.trim().to_string();
        }
        guard.room_id = room_id.filter(|s| !s.trim().is_empty());
        guard.lan_pin = lan_pin.filter(|s| !s.trim().is_empty());
    }
    state.broadcast_beacon("probe");
    state.self_info()
}

#[tauri::command]
pub fn update_lan_snapshot(
    state: tauri::State<'_, LanSyncState>,
    snapshot: Option<Value>,
    now_playing: Option<LanNowPlayingSummary>,
) {
    let mut guard = state.inner.lock().unwrap();
    if let Some(snap) = snapshot {
        guard.snapshot_updated_at = snap
            .get("updatedAt")
            .and_then(|v| v.as_u64())
            .unwrap_or_else(now_ms);
        guard.snapshot_json = Some(snap);
    }
    if now_playing.is_some() {
        guard.now_playing = now_playing;
    }
}

#[tauri::command]
pub fn get_lan_devices(state: tauri::State<'_, LanSyncState>) -> LanDiscoveryResult {
    state.refresh_local_ips();
    LanDiscoveryResult {
        self_info: state.self_info(),
        peers: state.active_peers(),
    }
}

#[tauri::command]
pub fn refresh_lan_discovery(state: tauri::State<'_, LanSyncState>) -> LanDiscoveryResult {
    state.broadcast_beacon("probe");
    LanDiscoveryResult {
        self_info: state.self_info(),
        peers: state.active_peers(),
    }
}

async fn post_lan_json<Req: Serialize, Resp: serde::de::DeserializeOwned>(
    url: &str,
    body: &Req,
    pin: Option<&str>,
    action_label: &str,
) -> Result<Resp, String> {
    let client = lan_http_client()?;
    let encoded = serde_json::to_vec(body).map_err(|e| e.to_string())?;
    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(encoded);
    if let Some(p) = pin {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            req = req.header("X-Skymusic-Pin", trimmed);
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("{action_label} could not reach peer: {e}"))?;
    if res.status().as_u16() == 403 {
        return Err("Target device requires a matching Wi-Fi PIN".to_string());
    }
    if !res.status().is_success() {
        return Err(format!("{action_label} error: HTTP {}", res.status()));
    }
    let raw = res
        .bytes()
        .await
        .map_err(|e| format!("Failed reading peer response: {e}"))?;
    serde_json::from_slice::<Resp>(&raw).map_err(|e| format!("Invalid peer JSON response: {e}"))
}

#[tauri::command]
pub async fn probe_lan_ip(
    app: AppHandle,
    state: tauri::State<'_, LanSyncState>,
    ip: String,
    port: Option<u16>,
) -> Result<LanDeviceInfo, String> {
    let target_ip = ip.trim().to_string();
    if target_ip.is_empty() {
        return Err("Enter a valid LAN IP address".to_string());
    }
    let target_port = port.unwrap_or(LAN_HTTP_PORT);
    let url = format!("http://{target_ip}:{target_port}/lan/ping");
    let self_info = state.self_info();

    let mut info: LanDeviceInfo =
        post_lan_json(&url, &self_info, None, "Wi-Fi probe").await?;
    info.ip = target_ip;
    if info.port == 0 {
        info.port = target_port;
    }
    state.upsert_peer(info.clone());
    let _ = app.emit("lan-peers-updated", state.active_peers());
    Ok(info)
}

#[tauri::command]
pub async fn sync_with_lan_peer(
    app: AppHandle,
    state: tauri::State<'_, LanSyncState>,
    ip: String,
    port: u16,
    pin: Option<String>,
) -> Result<Value, String> {
    let url = format!("http://{}:{}/lan/state", ip.trim(), port);
    let (self_info, local_snap, saved_pin) = {
        let info = state.self_info();
        let guard = state.inner.lock().unwrap();
        (info, guard.snapshot_json.clone(), guard.lan_pin.clone())
    };
    let effective_pin = pin.or(saved_pin);

    let req_body = serde_json::json!({
        "senderInfo": self_info,
        "snapshot": local_snap,
        "pin": effective_pin
    });
    let body: Value = post_lan_json(
        &url,
        &req_body,
        effective_pin.as_deref(),
        "Wi-Fi sync",
    )
    .await?;

    if let Some(mut peer_info) = body
        .get("info")
        .and_then(|v| serde_json::from_value::<LanDeviceInfo>(v.clone()).ok())
    {
        peer_info.ip = ip.trim().to_string();
        state.upsert_peer(peer_info);
        let _ = app.emit("lan-peers-updated", state.active_peers());
    }
    if let Some(snap) = body.get("snapshot").filter(|v| !v.is_null()) {
        let _ = app.emit("lan-sync-received", snap);
        return Ok(snap.clone());
    }
    Ok(Value::Null)
}

#[tauri::command]
pub async fn send_lan_cast(
    state: tauri::State<'_, LanSyncState>,
    ip: String,
    port: u16,
    command: LanCastCommand,
) -> Result<LanDeviceInfo, String> {
    let url = format!("http://{}:{}/lan/control", ip.trim(), port);
    let saved_pin = {
        let guard = state.inner.lock().unwrap();
        guard.lan_pin.clone()
    };
    let effective_pin = command.pin.clone().or(saved_pin);
    let mut payload = command;
    payload.pin = effective_pin.clone();

    let body: Value = post_lan_json(
        &url,
        &payload,
        effective_pin.as_deref(),
        "Cast command",
    )
    .await?;

    if let Some(mut info) = body
        .get("info")
        .and_then(|v| serde_json::from_value::<LanDeviceInfo>(v.clone()).ok())
    {
        info.ip = ip.trim().to_string();
        state.upsert_peer(info.clone());
        return Ok(info);
    }
    Err("Cast acknowledged without device info".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_global_and_subnet_broadcast_targets() {
        let targets = build_broadcast_targets(&["192.168.1.42".to_string()], LAN_UDP_PORT);
        assert!(targets.contains(&"255.255.255.255:45781".parse().unwrap()));
        assert!(targets.contains(&"192.168.1.255:45781".parse().unwrap()));
    }

    #[test]
    fn validates_optional_lan_pin() {
        let state = LanSyncState::new("1.4.0".to_string(), LAN_HTTP_PORT);
        assert!(state.check_pin(None));
        {
            let mut g = state.inner.lock().unwrap();
            g.lan_pin = Some("4821".to_string());
        }
        assert!(!state.check_pin(None));
        assert!(!state.check_pin(Some("1234")));
        assert!(state.check_pin(Some(" 4821 ")));
    }
}
