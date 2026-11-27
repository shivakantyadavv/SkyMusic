import { smartFetch } from "./http";

export interface LyricLine {
  time: number | null; // seconds if synced, null if plain
  text: string;
}

export interface LyricsResult {
  synced: boolean;
  lines: LyricLine[];
  source: "lrclib" | "lyrics.ovh" | "none";
}

const lyricsCache = new Map<string, LyricsResult>();

function cleanTrackTitle(title: string): string {
  return (
    title
      .replace(/\(feat\..*?\)|\[feat\..*?\]/gi, "")
      .replace(/\(from .*?\)|\[from .*?\]/gi, "")
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim() || title.trim()
  );
}

function getPrimaryArtist(artist: string): string {
  return (
    artist
      .split(/,|&|feat\.|ft\.|x\s/i)[0]
      .replace(/\s+/g, " ")
      .trim() || artist.trim()
  );
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timeTagRegex)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(timeTagRegex, "").trim();
    if (!text) continue;

    for (const m of matches) {
      const mins = Number(m[1]);
      const secs = Number(m[2]);
      const msRaw = m[3] || "0";
      const ms = Number(msRaw.padEnd(3, "0")) / 1000;
      const totalSeconds = mins * 60 + secs + ms;
      lines.push({ time: totalSeconds, text });
    }
  }

  return lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

function parsePlainLyrics(plain: string): LyricLine[] {
  return plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ time: null, text }));
}

interface LrcLibItem {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

export async function fetchLyrics(
  title: string,
  artist: string
): Promise<LyricsResult> {
  const cleanTitle = cleanTrackTitle(title);
  const primaryArtist = getPrimaryArtist(artist);
  const cacheKey = `${cleanTitle.toLowerCase()}::${primaryArtist.toLowerCase()}`;

  const cached = lyricsCache.get(cacheKey);
  if (cached) return cached;

  // 1. Try LRCLIB exact track + artist search
  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(
      cleanTitle
    )}&artist_name=${encodeURIComponent(primaryArtist)}`;
    const res = await smartFetch(url);
    if (res.ok) {
      const items = (await res.json()) as LrcLibItem[];
      if (Array.isArray(items) && items.length > 0) {
        const syncedMatch = items.find((i) => Boolean(i.syncedLyrics));
        if (syncedMatch?.syncedLyrics) {
          const parsed = parseLrc(syncedMatch.syncedLyrics);
          if (parsed.length > 0) {
            const result: LyricsResult = {
              synced: true,
              lines: parsed,
              source: "lrclib",
            };
            lyricsCache.set(cacheKey, result);
            return result;
          }
        }
        const plainMatch = items.find((i) => Boolean(i.plainLyrics));
        if (plainMatch?.plainLyrics) {
          const result: LyricsResult = {
            synced: false,
            lines: parsePlainLyrics(plainMatch.plainLyrics),
            source: "lrclib",
          };
          lyricsCache.set(cacheKey, result);
          return result;
        }
      }
    }
  } catch {
    // try next
  }

  // 2. Try LRCLIB general query
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(
      `${cleanTitle} ${primaryArtist}`
    )}`;
    const res = await smartFetch(url);
    if (res.ok) {
      const items = (await res.json()) as LrcLibItem[];
      if (Array.isArray(items) && items.length > 0) {
        const syncedMatch = items.find((i) => Boolean(i.syncedLyrics));
        if (syncedMatch?.syncedLyrics) {
          const parsed = parseLrc(syncedMatch.syncedLyrics);
          if (parsed.length > 0) {
            const result: LyricsResult = {
              synced: true,
              lines: parsed,
              source: "lrclib",
            };
            lyricsCache.set(cacheKey, result);
            return result;
          }
        }
        const plainMatch = items.find((i) => Boolean(i.plainLyrics));
        if (plainMatch?.plainLyrics) {
          const result: LyricsResult = {
            synced: false,
            lines: parsePlainLyrics(plainMatch.plainLyrics),
            source: "lrclib",
          };
          lyricsCache.set(cacheKey, result);
          return result;
        }
      }
    }
  } catch {
    // try fallback
  }

  // 3. Fallback to lyrics.ovh
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(
      primaryArtist
    )}/${encodeURIComponent(cleanTitle)}`;
    const res = await smartFetch(url);
    if (res.ok) {
      const data = (await res.json()) as { lyrics?: string };
      if (data?.lyrics) {
        const result: LyricsResult = {
          synced: false,
          lines: parsePlainLyrics(data.lyrics),
          source: "lyrics.ovh",
        };
        lyricsCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    // ignore
  }

  return { synced: false, lines: [], source: "none" };
}
