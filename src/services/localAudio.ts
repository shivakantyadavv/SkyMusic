import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AudioQualityInfo, Track } from "../types/music";
import { isTauriEnv } from "./http";

const DEFAULT_LOCAL_ART =
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80";

interface LocalAudioRegistration {
  id: string;
  filePath: string;
  streamUrl: string;
  duration: number;
  quality: AudioQualityInfo;
}

function parseFileName(fileName: string): { title: string; artist: string } {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  const parts = withoutExt.split(" - ");
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim(),
    };
  }
  return {
    title: withoutExt,
    artist: "Local Audio",
  };
}

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (dur: number) => {
      audio.src = "";
      resolve(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
    };
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

function fallbackQualityFromName(fileName: string): AudioQualityInfo {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "flac") {
    return {
      badge: "LOSSLESS",
      detail: "FLAC • Lossless",
      codec: "FLAC",
      tier: "lossless",
    };
  }
  if (ext === "wav") {
    return {
      badge: "LOSSLESS",
      detail: "WAV • Lossless",
      codec: "WAV",
      tier: "lossless",
    };
  }
  return {
    badge: ext ? ext.toUpperCase() : "AUDIO",
    detail: ext ? `${ext.toUpperCase()} • Local Audio` : "Local Audio",
    codec: ext ? ext.toUpperCase() : undefined,
    tier: "hq",
  };
}

export async function refreshLocalRegistration(
  track: Track
): Promise<Track | null> {
  if (!track.localPath || !isTauriEnv()) return track;
  try {
    const reg = await invoke<LocalAudioRegistration>("register_local_audio", {
      path: track.localPath,
      isDownloadedHq: track.source === "downloaded",
    });
    return {
      ...track,
      streamUrl: reg.streamUrl,
      duration: reg.duration > 0 ? reg.duration : track.duration,
      quality: reg.quality,
    };
  } catch {
    return null;
  }
}

export async function pickLocalAudioFiles(): Promise<Track[]> {
  if (isTauriEnv()) {
    try {
      window.SkymusicAndroid?.ensureStoragePermissions?.();
    } catch {
      // Ignore permission bridge error outside Android
    }

    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Audio Files",
          extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac"],
        },
      ],
    });

    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];

    const tracks = await Promise.all(
      paths.map(async (filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || "Unknown Track";
        const { title, artist } = parseFileName(fileName);

        try {
          const reg = await invoke<LocalAudioRegistration>(
            "register_local_audio",
            {
              path: filePath,
              isDownloadedHq: false,
            }
          );
          const duration =
            reg.duration > 0 ? reg.duration : await probeDuration(reg.streamUrl);
          return {
            id: `local-${filePath}-${Date.now()}`,
            title,
            artist,
            album: "Local Storage",
            albumArt: DEFAULT_LOCAL_ART,
            duration,
            streamUrl: reg.streamUrl,
            source: "local" as const,
            localPath: filePath,
            fileName,
            quality: reg.quality,
          };
        } catch {
          const streamUrl = convertFileSrc(filePath);
          const duration = await probeDuration(streamUrl);
          return {
            id: `local-${filePath}-${Date.now()}`,
            title,
            artist,
            album: "Local Storage",
            albumArt: DEFAULT_LOCAL_ART,
            duration,
            streamUrl,
            source: "local" as const,
            localPath: filePath,
            fileName,
            quality: fallbackQualityFromName(fileName),
          };
        }
      })
    );

    return tracks;
  }

  // Browser / Web fallback using <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*,.mp3,.flac,.wav,.ogg,.m4a";
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const tracks = await Promise.all(
        files.map(async (file) => {
          const { title, artist } = parseFileName(file.name);
          const streamUrl = URL.createObjectURL(file);
          const duration = await probeDuration(streamUrl);
          return {
            id: `local-${file.name}-${file.size}-${Date.now()}`,
            title,
            artist,
            album: "Local Storage",
            albumArt: DEFAULT_LOCAL_ART,
            duration,
            streamUrl,
            source: "local" as const,
            fileName: file.name,
            quality: fallbackQualityFromName(file.name),
          };
        })
      );
      resolve(tracks);
    };
    input.click();
  });
}
