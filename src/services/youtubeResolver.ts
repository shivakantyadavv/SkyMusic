import { invoke } from "@tauri-apps/api/core";
import { isTauriEnv, smartFetch } from "./http";

const ytCache = new Map<string, string[]>();

export function clearYoutubeCache(): void {
  ytCache.clear();
}

function parseYoutubeIdsFromHtml(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const primaryRegex =
    /"(?:videoRenderer|videoWithContextRenderer|compactVideoRenderer)":\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let match: RegExpExecArray | null;
  while ((match = primaryRegex.exec(html)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= 8) break;
    }
  }

  if (ids.length === 0) {
    const fallbackRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    while ((match = fallbackRegex.exec(html)) !== null) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
        if (ids.length >= 8) break;
      }
    }
  }

  return ids;
}

async function fetchYoutubeSearchIds(query: string): Promise<string[]> {
  if (isTauriEnv()) {
    return invoke<string[]>("search_youtube_ids", { query });
  }

  const url = `/api/yt/results?search_query=${encodeURIComponent(query)}`;
  const res = await smartFetch(url);
  if (!res.ok) return [];
  const html = await res.text();
  return parseYoutubeIdsFromHtml(html);
}

export async function resolveYoutubeVideoIds(
  title: string,
  artist: string
): Promise<string[]> {
  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, " ").trim() || title;
  const query = `${cleanTitle} ${artist} official audio`
    .replace(/\s+/g, " ")
    .trim();
  const cacheKey = query.toLowerCase();

  const cached = ytCache.get(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    let ids = await fetchYoutubeSearchIds(query);

    if (ids.length === 0) {
      const fallbackQuery = `${cleanTitle} ${artist}`.replace(/\s+/g, " ").trim();
      ids = await fetchYoutubeSearchIds(fallbackQuery);
    }

    if (ids.length > 0) {
      ytCache.set(cacheKey, ids);
    }
    return ids;
  } catch {
    return [];
  }
}
