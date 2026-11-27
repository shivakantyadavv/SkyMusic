import { ATMOS_PRESETS } from "../audio/spatialAudio";
import { AtmosPreset, AudioQualityInfo, Track } from "../types/music";

export type StreamSourceKind = "yt-stream" | "youtube-iframe" | "preview" | "local" | "downloaded" | null;

export function getPresetLabel(preset: AtmosPreset): string {
  return ATMOS_PRESETS.find((p) => p.id === preset)?.label || "Off";
}

export function getTrackBadgeQuality(
  track: Track,
  isCurrent: boolean,
  atmosPreset: AtmosPreset,
  activeStreamKind: StreamSourceKind
): AudioQualityInfo {
  const atmosActive = atmosPreset !== "off";

  if (track.source === "local") {
    const base = track.quality || {
      badge: "AUDIO",
      detail: "Local Audio File",
      tier: "hq" as const,
    };
    if (isCurrent && atmosActive) {
      return {
        ...base,
        detail: `${base.detail} • Atmos`,
      };
    }
    return base;
  }

  if (track.source === "downloaded") {
    const base = track.quality || {
      badge: "HQ 320kbps",
      detail: "HQ • 320kbps AAC Offline",
      codec: "AAC",
      bitrateKbps: 320,
      tier: "hq" as const,
    };
    if (isCurrent && atmosActive) {
      return {
        ...base,
        detail: `DOLBY ATMOS • ${base.detail}`,
      };
    }
    return base;
  }

  if (isCurrent) {
    if (activeStreamKind === "preview") {
      return {
        badge: atmosActive ? "ATMOS" : "128K",
        detail: atmosActive
          ? "DOLBY ATMOS • Spatial (128kbps Preview)"
          : "128kbps • Preview",
        codec: "MP3/AAC",
        bitrateKbps: 128,
        tier: atmosActive ? "atmos" : "preview",
      };
    }

    if (atmosActive) {
      return {
        badge: "ATMOS",
        detail: "DOLBY ATMOS • Spatial",
        codec: "AAC / Spatial DSP",
        bitrateKbps: 256,
        tier: "atmos",
      };
    }

    return {
      badge: "HQ",
      detail: "HQ • 256kbps AAC",
      codec: "AAC",
      bitrateKbps: 256,
      tier: "hq",
    };
  }

  if (atmosActive) {
    return {
      badge: "HQ",
      detail: "HQ • 256kbps AAC",
      tier: "hq",
    };
  }

  return {
    badge: "HQ",
    detail: "HQ • 256kbps AAC",
    tier: "hq",
  };
}
