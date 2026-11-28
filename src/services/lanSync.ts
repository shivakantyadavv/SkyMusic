import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  LanCastCommand,
  LanDeviceInfo,
  LanDiscoveryResult,
  LanNowPlayingSummary,
  SyncSnapshot,
} from "../types/music";
import { sanitizeSnapshotForTransport } from "../utils/syncMerge";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function initLanSync(params: {
  deviceId: string;
  deviceName: string;
  platform: "desktop" | "tv" | "mobile";
  roomId?: string | null;
  lanPin?: string | null;
}): Promise<LanDeviceInfo | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LanDeviceInfo>("init_lan_sync", {
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    platform: params.platform,
    roomId: params.roomId ?? null,
    lanPin: params.lanPin ?? null,
  });
}

export async function updateLanSnapshot(
  snapshot: SyncSnapshot | null,
  nowPlaying: LanNowPlayingSummary | null
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("update_lan_snapshot", {
    snapshot: snapshot ? sanitizeSnapshotForTransport(snapshot) : null,
    nowPlaying,
  });
}

export async function getLanDevices(): Promise<LanDiscoveryResult | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LanDiscoveryResult>("get_lan_devices");
}

export async function refreshLanDiscovery(): Promise<LanDiscoveryResult | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LanDiscoveryResult>("refresh_lan_discovery");
}

export async function probeLanIp(
  ip: string,
  port?: number
): Promise<LanDeviceInfo> {
  return invoke<LanDeviceInfo>("probe_lan_ip", {
    ip: ip.trim(),
    port: port ?? null,
  });
}

export async function syncWithLanPeer(
  ip: string,
  port: number,
  pin?: string | null
): Promise<SyncSnapshot | null> {
  const res = await invoke<SyncSnapshot | null>("sync_with_lan_peer", {
    ip,
    port,
    pin: pin ?? null,
  });
  return res;
}

export async function sendLanCast(
  ip: string,
  port: number,
  command: LanCastCommand
): Promise<LanDeviceInfo> {
  return invoke<LanDeviceInfo>("send_lan_cast", {
    ip,
    port,
    command,
  });
}

export async function onLanPeersUpdated(
  cb: (peers: LanDeviceInfo[]) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<LanDeviceInfo[]>("lan-peers-updated", (ev) => cb(ev.payload));
}

export async function onLanSyncReceived(
  cb: (snapshot: SyncSnapshot) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<SyncSnapshot>("lan-sync-received", (ev) => {
    if (ev.payload) cb(ev.payload);
  });
}

export async function onLanCastCommand(
  cb: (cmd: LanCastCommand) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<LanCastCommand>("lan-cast-command", (ev) => {
    if (ev.payload) cb(ev.payload);
  });
}
