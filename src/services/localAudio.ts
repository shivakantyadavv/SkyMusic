import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Track } from "../types/music";
import { isTauriEnv } from "./http";

const DEFAULT_LOCAL_ART =
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80";

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

export async function pickLocalAudioFiles(): Promise<Track[]> {
  if (isTauriEnv()) {
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
        };
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
          };
        })
      );
      resolve(tracks);
    };
    input.click();
  });
}
