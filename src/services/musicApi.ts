import {
  DESI_ARTIST_SEEDS,
  DESI_PLAYLIST_SEEDS,
  FRESH_DESI_QUERY_POOL,
} from "../data/indianPakistaniCatalog";
import {
  AlbumDetailData,
  AlbumItem,
  ArtistItem,
  ArtistProfileData,
  HomeSection,
  SearchResults,
  Track,
} from "../types/music";
import { isTauriEnv, smartFetch } from "./http";

interface DeezerTrackRaw {
  id: number;
  title: string;
  duration: number;
  preview: string;
  link?: string;
  artist: {
    id: number;
    name: string;
    picture_medium?: string;
    picture_big?: string;
    picture_xl?: string;
  };
  album: {
    id: number;
    title: string;
    cover_medium?: string;
    cover_big?: string;
    cover_xl?: string;
  };
}

interface DeezerArtistRaw {
  id: number;
  name: string;
  picture_medium?: string;
  picture_big?: string;
  picture_xl?: string;
  nb_fan?: number;
}

interface DeezerAlbumRaw {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  release_date?: string;
  nb_tracks?: number;
  artist?: { name?: string };
}

interface ItunesTrackRaw {
  wrapperType?: string;
  trackId: number;
  trackName: string;
  artistId?: number;
  artistName: string;
  collectionId: number;
  collectionName: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
}

interface ItunesArtistRaw {
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
}

interface ItunesAlbumRaw {
  wrapperType?: string;
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100?: string;
  releaseDate?: string;
  trackCount?: number;
}

const FALLBACK_ART =
  "https://images.unsplash.com/photo-1614613535768-5e830bb27e3d?w=500&q=80";

const HOME_CACHE_KEY = "skymusic_home_catalog_v2";
const ARTISTS_CACHE_KEY = "skymusic_popular_artists_v1";
const CACHE_TTL_MS = 25 * 60 * 1000;

let memoryHomeSections: HomeSection[] | null = null;
let memoryHomeFetchedAt = 0;
let refreshCounter = Math.floor(Date.now() / (1000 * 60 * 60 * 6)); // rotates naturally over hours + refresh clicks

const artistProfileCache = new Map<string, { data: ArtistProfileData; at: number }>();
const albumDetailCache = new Map<string, { data: AlbumDetailData; at: number }>();

function getDeezerBaseUrl(): string {
  return isTauriEnv() ? "https://api.deezer.com" : "/api/deezer";
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatFanCount(fans?: number): string | undefined {
  if (!fans || fans <= 0) return undefined;
  if (fans >= 1_000_000) return `${(fans / 1_000_000).toFixed(1)}M listeners`;
  if (fans >= 1_000) return `${Math.round(fans / 1_000)}K listeners`;
  return `${fans} listeners`;
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed + 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deduplicateTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (!t.title || !t.artist) continue;
    const key = `${normText(t.title)}::${normText(t.artist.split(/[,&]/)[0] || t.artist)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

function mapDeezerTrack(item: DeezerTrackRaw): Track {
  return {
    id: `dz-${item.id}`,
    title: item.title,
    artist: item.artist?.name || "Unknown Artist",
    artistId: item.artist?.id,
    album: item.album?.title || "Single",
    albumId: item.album?.id ? `dz-alb-${item.album.id}` : undefined,
    albumArt:
      item.album?.cover_xl ||
      item.album?.cover_big ||
      item.album?.cover_medium ||
      FALLBACK_ART,
    duration: item.duration || 180,
    streamUrl: item.preview || null,
    source: "deezer",
    externalUrl: item.link,
  };
}

function mapItunesTrack(item: ItunesTrackRaw): Track {
  const highResArt = item.artworkUrl100
    ? item.artworkUrl100.replace("100x100bb", "600x600bb")
    : FALLBACK_ART;
  return {
    id: `it-${item.trackId}`,
    title: item.trackName,
    artist: item.artistName,
    artistId: item.artistId,
    album: item.collectionName || "Single",
    albumId: item.collectionId ? `it-alb-${item.collectionId}` : undefined,
    albumArt: highResArt,
    duration: item.trackTimeMillis
      ? Math.round(item.trackTimeMillis / 1000)
      : 180,
    streamUrl: item.previewUrl || null,
    source: "itunes",
    externalUrl: item.trackViewUrl,
  };
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const res = await smartFetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function mapBatched<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batch = await Promise.all(slice.map(worker));
    results.push(...batch);
  }
  return results;
}

/** Searches Deezer & iTunes (India-first) returning tracks, hydrated artists, and albums. */
export async function searchMusic(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { tracks: [], artists: [], albums: [] };
  }

  const encoded = encodeURIComponent(trimmed);
  const qNorm = normText(trimmed);

  // Match curated India/Pakistan artists instantly (ensures Vishal Mishra, Sonu Nigam, etc. always surface)
  const seedMatches = DESI_ARTIST_SEEDS.filter(
    (s) =>
      normText(s.name).includes(qNorm) ||
      qNorm.includes(normText(s.name))
  );

  const [dzTracksJson, dzArtistsJson, itSongsJson, itArtistsJson] =
    await Promise.all([
      fetchJsonSafe<{ data?: DeezerTrackRaw[] }>(
        `${getDeezerBaseUrl()}/search?q=${encoded}&limit=25`
      ),
      fetchJsonSafe<{ data?: DeezerArtistRaw[] }>(
        `${getDeezerBaseUrl()}/search/artist?q=${encoded}&limit=8`
      ),
      fetchJsonSafe<{ results?: ItunesTrackRaw[] }>(
        `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&country=IN&limit=25`
      ),
      fetchJsonSafe<{ results?: ItunesArtistRaw[] }>(
        `https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&country=IN&limit=6`
      ),
    ]);

  const tracks: Track[] = [];
  const artistMap = new Map<string, ArtistItem>();
  const albumMap = new Map<string, AlbumItem>();

  const upsertArtist = (incoming: ArtistItem) => {
    const key = normText(incoming.name);
    if (!key) return;
    const prev = artistMap.get(key);
    if (!prev) {
      artistMap.set(key, incoming);
      return;
    }
    artistMap.set(key, {
      ...prev,
      id: prev.deezerId ? prev.id : incoming.id,
      deezerId: prev.deezerId || incoming.deezerId,
      itunesId: prev.itunesId || incoming.itunesId,
      image:
        prev.image && prev.image !== FALLBACK_ART ? prev.image : incoming.image,
      fans: prev.fans || incoming.fans,
      followers: prev.followers || incoming.followers,
      genre: prev.genre || incoming.genre,
    });
  };

  // Seed matches first (hydrate their Deezer portrait in parallel if matched)
  if (seedMatches.length > 0) {
    const hydrated = await Promise.all(
      seedMatches.slice(0, 4).map(async (seed) => {
        const dz = await fetchJsonSafe<DeezerArtistRaw>(
          `${getDeezerBaseUrl()}/artist/${seed.deezerId}`
        );
        return {
          id: `dz-art-${seed.deezerId}`,
          name: seed.name,
          deezerId: seed.deezerId,
          itunesId: seed.itunesId,
          genre: seed.genre,
          fans: dz?.nb_fan,
          followers: formatFanCount(dz?.nb_fan),
          image: dz?.picture_xl || dz?.picture_big || dz?.picture_medium || FALLBACK_ART,
          source: "deezer" as const,
        };
      })
    );
    hydrated.forEach(upsertArtist);
  }

  for (const a of dzArtistsJson?.data || []) {
    upsertArtist({
      id: `dz-art-${a.id}`,
      name: a.name,
      deezerId: a.id,
      fans: a.nb_fan,
      followers: formatFanCount(a.nb_fan),
      image: a.picture_xl || a.picture_big || a.picture_medium || FALLBACK_ART,
      source: "deezer",
    });
  }

  for (const a of itArtistsJson?.results || []) {
    upsertArtist({
      id: `it-art-${a.artistId}`,
      name: a.artistName,
      itunesId: a.artistId,
      genre: a.primaryGenreName,
      image: FALLBACK_ART,
      source: "itunes",
    });
  }

  for (const raw of dzTracksJson?.data || []) {
    const mapped = mapDeezerTrack(raw);
    tracks.push(mapped);

    if (raw.artist) {
      upsertArtist({
        id: `dz-art-${raw.artist.id}`,
        name: raw.artist.name,
        deezerId: raw.artist.id,
        image:
          raw.artist.picture_xl ||
          raw.artist.picture_big ||
          raw.artist.picture_medium ||
          mapped.albumArt,
        source: "deezer",
      });
    }
    if (raw.album && !albumMap.has(normText(raw.album.title))) {
      albumMap.set(normText(raw.album.title), {
        id: `dz-alb-${raw.album.id}`,
        title: raw.album.title,
        artist: raw.artist?.name || "Unknown",
        deezerId: raw.album.id,
        image:
          raw.album.cover_xl ||
          raw.album.cover_big ||
          raw.album.cover_medium ||
          mapped.albumArt,
        source: "deezer",
      });
    }
  }

  for (const raw of itSongsJson?.results || []) {
    const mapped = mapItunesTrack(raw);
    tracks.push(mapped);

    if (raw.artistId && raw.artistName) {
      upsertArtist({
        id: `it-art-${raw.artistId}`,
        name: raw.artistName,
        itunesId: raw.artistId,
        image: mapped.albumArt,
        source: "itunes",
      });
    }
    if (raw.collectionId && !albumMap.has(normText(raw.collectionName))) {
      albumMap.set(normText(raw.collectionName), {
        id: `it-alb-${raw.collectionId}`,
        title: raw.collectionName,
        artist: raw.artistName,
        itunesId: raw.collectionId,
        image: mapped.albumArt,
        source: "itunes",
      });
    }
  }

  // Sort artists so exact / close matches to search query come first
  const artistsSorted = Array.from(artistMap.values()).sort((a, b) => {
    const aNorm = normText(a.name);
    const bNorm = normText(b.name);
    const aExact = aNorm === qNorm ? 3 : aNorm.startsWith(qNorm) ? 2 : aNorm.includes(qNorm) ? 1 : 0;
    const bExact = bNorm === qNorm ? 3 : bNorm.startsWith(qNorm) ? 2 : bNorm.includes(qNorm) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.fans || 0) - (a.fans || 0);
  });

  return {
    tracks: deduplicateTracks(tracks),
    artists: artistsSorted.slice(0, 12),
    albums: Array.from(albumMap.values()).slice(0, 12),
  };
}

async function fetchDeezerPlaylistTracks(
  playlistId: string,
  limit = 100
): Promise<Track[]> {
  const json = await fetchJsonSafe<{ data?: DeezerTrackRaw[] }>(
    `${getDeezerBaseUrl()}/playlist/${playlistId}/tracks?limit=${limit}`
  );
  if (!Array.isArray(json?.data)) return [];
  return json.data.map(mapDeezerTrack);
}

async function fetchMergedQueries(
  queries: string[],
  maxTracks = 40
): Promise<Track[]> {
  const results = await mapBatched(queries, 3, async (q) => {
    const encoded = encodeURIComponent(q);
    const [dz, it] = await Promise.all([
      fetchJsonSafe<{ data?: DeezerTrackRaw[] }>(
        `${getDeezerBaseUrl()}/search?q=${encoded}&limit=12`
      ),
      fetchJsonSafe<{ results?: ItunesTrackRaw[] }>(
        `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&country=IN&limit=12`
      ),
    ]);
    return [
      ...(dz?.data || []).map(mapDeezerTrack),
      ...(it?.results || []).map(mapItunesTrack),
    ];
  });

  return deduplicateTracks(results.flat()).slice(0, maxTracks);
}

/** Fetches popular verified Indian & Pakistani artists with cached HD portraits. */
export async function fetchPopularArtists(
  force = false
): Promise<ArtistItem[]> {
  if (!force) {
    try {
      const raw = localStorage.getItem(ARTISTS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; items: ArtistItem[] };
        if (Date.now() - parsed.at < 24 * 60 * 60 * 1000 && parsed.items.length > 0) {
          return parsed.items;
        }
      }
    } catch {
      // Ignore cache read failures
    }
  }

  const hydrated = await mapBatched(DESI_ARTIST_SEEDS.slice(0, 18), 6, async (seed) => {
    const dz = await fetchJsonSafe<DeezerArtistRaw>(
      `${getDeezerBaseUrl()}/artist/${seed.deezerId}`
    );
    return {
      id: `dz-art-${seed.deezerId}`,
      name: seed.name,
      deezerId: seed.deezerId,
      itunesId: seed.itunesId,
      genre: seed.genre,
      fans: dz?.nb_fan,
      followers: formatFanCount(dz?.nb_fan),
      image:
        dz?.picture_xl || dz?.picture_big || dz?.picture_medium || FALLBACK_ART,
      source: "deezer" as const,
    };
  });

  try {
    localStorage.setItem(
      ARTISTS_CACHE_KEY,
      JSON.stringify({ at: Date.now(), items: hydrated })
    );
  } catch {
    // Ignore storage quota errors
  }

  return hydrated;
}

/**
 * Fetches rich India & Pakistan Home catalog (Top 100 India, Hot Hits Pakistan,
 * Bollywood, Coke Studio & Sufi, Punjabi, 90s Classics, Desi Indie + Dynamic Daily Mix).
 */
export async function fetchHomeCatalog(opts?: {
  force?: boolean;
  seedTracks?: Track[];
}): Promise<HomeSection[]> {
  const force = Boolean(opts?.force);
  if (force) {
    refreshCounter += 1;
  }

  if (!force && memoryHomeSections && Date.now() - memoryHomeFetchedAt < CACHE_TTL_MS) {
    return memoryHomeSections;
  }

  if (!force) {
    try {
      const raw = localStorage.getItem(HOME_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; sections: HomeSection[] };
        if (
          Date.now() - parsed.at < CACHE_TTL_MS &&
          Array.isArray(parsed.sections) &&
          parsed.sections.length >= 5
        ) {
          memoryHomeSections = parsed.sections;
          memoryHomeFetchedAt = parsed.at;
          return parsed.sections;
        }
      }
    } catch {
      // Ignore storage failures
    }
  }

  // Fetch playlists in gentle batches to avoid public API burst throttling
  const loadedSections = await mapBatched(DESI_PLAYLIST_SEEDS, 3, async (seed) => {
    let tracks: Track[] = [];
    if (seed.deezerPlaylistId) {
      tracks = await fetchDeezerPlaylistTracks(
        seed.deezerPlaylistId,
        seed.targetCount
      );
    }
    if (tracks.length < 15) {
      const supplement = await fetchMergedQueries(
        seed.fallbackQueries,
        seed.targetCount
      );
      tracks = deduplicateTracks([...tracks, ...supplement]).slice(
        0,
        seed.targetCount
      );
    }

    // Add gentle fresh ordering on non-numbered mixes so recommendations vary
    const isChart = seed.id === "top-100-india" || seed.id === "hot-hits-pakistan";
    const finalTracks =
      force && !isChart ? shuffleWithSeed(tracks, refreshCounter) : tracks;

    return {
      id: seed.id,
      title: seed.title,
      subtitle: seed.subtitle,
      gradient: seed.gradient,
      coverImage: finalTracks[0]?.albumArt || FALLBACK_ART,
      category: seed.category,
      tracks: finalTracks,
    } as HomeSection;
  });

  // Build Personalized Daily Mix using recent listening history + rotating Desi pool
  const historyArtists = Array.from(
    new Set(
      (opts?.seedTracks || [])
        .map((t) => t.artist.split(/[,&]/)[0].trim())
        .filter((a) => a && a !== "Local Audio")
    )
  ).slice(0, 2);

  const rotatingPool =
    FRESH_DESI_QUERY_POOL[refreshCounter % FRESH_DESI_QUERY_POOL.length];
  const mixQueries = Array.from(new Set([...historyArtists, ...rotatingPool])).slice(
    0,
    4
  );
  const rawMixTracks = await fetchMergedQueries(mixQueries, 36);
  const dailyMixTracks = shuffleWithSeed(rawMixTracks, refreshCounter + 17);

  const personalizedSection: HomeSection = {
    id: "made-for-you",
    title:
      historyArtists.length > 0
        ? `Made For You • ${historyArtists.join(" & ")}`
        : "Daily Mix • India & Pakistan",
    subtitle: "Fresh recommendations mixed from your taste & Desi charts",
    gradient: "from-[#0EA5E9] to-[#1DB954]",
    coverImage: dailyMixTracks[0]?.albumArt || FALLBACK_ART,
    category: "mix",
    tracks: dailyMixTracks,
  };

  const valid = [
    personalizedSection,
    ...loadedSections.filter((s) => s.tracks.length > 0),
  ];

  memoryHomeSections = valid;
  memoryHomeFetchedAt = Date.now();

  try {
    // Store trimmed cache snapshot (first 100 per list fits comfortably under localStorage limits)
    localStorage.setItem(
      HOME_CACHE_KEY,
      JSON.stringify({ at: memoryHomeFetchedAt, sections: valid })
    );
  } catch {
    // Ignore storage quota overflow if browser quota is tight
  }

  return valid;
}

/**
 * Fetches full Spotify-style Artist Profile: bio metadata, 40-60+ songs,
 * albums/singles, and related artists (Indian & Pakistani first).
 */
export async function fetchArtistProfile(
  artist: ArtistItem
): Promise<ArtistProfileData> {
  const cacheKey = normText(artist.name);
  const cached = artistProfileCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) {
    return cached.data;
  }

  const seed = DESI_ARTIST_SEEDS.find(
    (s) =>
      normText(s.name) === cacheKey ||
      (artist.deezerId && s.deezerId === artist.deezerId)
  );

  let deezerId = artist.deezerId || seed?.deezerId;
  let itunesId = artist.itunesId || seed?.itunesId;

  // Discover missing IDs cleanly in parallel
  const [dzFind, itFind] = await Promise.all([
    !deezerId
      ? fetchJsonSafe<{ data?: DeezerArtistRaw[] }>(
          `${getDeezerBaseUrl()}/search/artist?q=${encodeURIComponent(artist.name)}&limit=5`
        )
      : Promise.resolve(null),
    !itunesId
      ? fetchJsonSafe<{ results?: ItunesArtistRaw[] }>(
          `https://itunes.apple.com/search?term=${encodeURIComponent(artist.name)}&entity=musicArtist&country=IN&limit=5`
        )
      : Promise.resolve(null),
  ]);

  if (!deezerId && dzFind?.data?.length) {
    const exactDz =
      dzFind.data.find((d) => normText(d.name) === cacheKey) || dzFind.data[0];
    deezerId = exactDz.id;
  }
  if (!itunesId && itFind?.results?.length) {
    const exactIt =
      itFind.results.find((d) => normText(d.artistName) === cacheKey) ||
      itFind.results[0];
    itunesId = exactIt.artistId;
  }

  // Fetch top tracks, albums, artist metadata, and related artists concurrently
  const [
    dzInfo,
    dzTop,
    dzAlbums,
    dzRelated,
    itSongs,
    itAlbums,
    supplementSongs,
  ] = await Promise.all([
    deezerId
      ? fetchJsonSafe<DeezerArtistRaw>(`${getDeezerBaseUrl()}/artist/${deezerId}`)
      : Promise.resolve(null),
    deezerId
      ? fetchJsonSafe<{ data?: DeezerTrackRaw[] }>(
          `${getDeezerBaseUrl()}/artist/${deezerId}/top?limit=50`
        )
      : Promise.resolve(null),
    deezerId
      ? fetchJsonSafe<{ data?: DeezerAlbumRaw[] }>(
          `${getDeezerBaseUrl()}/artist/${deezerId}/albums?limit=20`
        )
      : Promise.resolve(null),
    deezerId
      ? fetchJsonSafe<{ data?: DeezerArtistRaw[] }>(
          `${getDeezerBaseUrl()}/artist/${deezerId}/related?limit=12`
        )
      : Promise.resolve(null),
    itunesId
      ? fetchJsonSafe<{ results?: ItunesTrackRaw[] }>(
          `https://itunes.apple.com/lookup?id=${itunesId}&entity=song&country=IN&limit=50`
        )
      : Promise.resolve(null),
    itunesId
      ? fetchJsonSafe<{ results?: ItunesAlbumRaw[] }>(
          `https://itunes.apple.com/lookup?id=${itunesId}&entity=album&country=IN&limit=20`
        )
      : Promise.resolve(null),
    fetchMergedQueries([artist.name], 35),
  ]);

  const artistTracks: Track[] = [
    ...(dzTop?.data || []).map(mapDeezerTrack),
    ...(itSongs?.results || [])
      .filter((r) => r.wrapperType === "track" || Boolean(r.trackName))
      .map(mapItunesTrack),
    ...supplementSongs.filter((t) =>
      normText(t.artist).includes(cacheKey)
    ),
  ];

  const topTracks = deduplicateTracks(artistTracks).slice(0, 60);

  // Merge Albums & Singles
  const albumMap = new Map<string, AlbumItem>();
  for (const a of dzAlbums?.data || []) {
    const k = normText(a.title);
    if (k && !albumMap.has(k)) {
      albumMap.set(k, {
        id: `dz-alb-${a.id}`,
        title: a.title,
        artist: artist.name,
        deezerId: a.id,
        image: a.cover_xl || a.cover_big || a.cover_medium || topTracks[0]?.albumArt || FALLBACK_ART,
        releaseDate: a.release_date,
        trackCount: a.nb_tracks,
        source: "deezer",
      });
    }
  }
  for (const a of itAlbums?.results || []) {
    if (a.wrapperType && a.wrapperType !== "collection") continue;
    if (!a.collectionName) continue;
    const k = normText(a.collectionName);
    if (!albumMap.has(k)) {
      albumMap.set(k, {
        id: `it-alb-${a.collectionId}`,
        title: a.collectionName,
        artist: a.artistName || artist.name,
        itunesId: a.collectionId,
        image: a.artworkUrl100
          ? a.artworkUrl100.replace("100x100bb", "600x600bb")
          : topTracks[0]?.albumArt || FALLBACK_ART,
        releaseDate: a.releaseDate?.slice(0, 10),
        trackCount: a.trackCount,
        source: "itunes",
      });
    }
  }

  const relatedArtists: ArtistItem[] = (dzRelated?.data || [])
    .slice(0, 12)
    .map((r) => ({
      id: `dz-art-${r.id}`,
      name: r.name,
      deezerId: r.id,
      fans: r.nb_fan,
      followers: formatFanCount(r.nb_fan),
      image: r.picture_xl || r.picture_big || r.picture_medium || FALLBACK_ART,
      source: "deezer",
    }));

  const enrichedArtist: ArtistItem = {
    ...artist,
    deezerId,
    itunesId,
    fans: dzInfo?.nb_fan || artist.fans,
    followers: formatFanCount(dzInfo?.nb_fan || artist.fans) || artist.followers,
    genre: seed?.genre || artist.genre || "India & Pakistan • Featured Artist",
    image:
      dzInfo?.picture_xl ||
      dzInfo?.picture_big ||
      (artist.image && artist.image !== FALLBACK_ART ? artist.image : topTracks[0]?.albumArt) ||
      FALLBACK_ART,
  };

  const data: ArtistProfileData = {
    artist: enrichedArtist,
    topTracks,
    albums: Array.from(albumMap.values()).slice(0, 20),
    relatedArtists,
  };

  artistProfileCache.set(cacheKey, { data, at: Date.now() });
  return data;
}

/** Fetches full album tracklist from iTunes or Deezer. */
export async function fetchAlbumDetail(
  album: AlbumItem
): Promise<AlbumDetailData> {
  const cached = albumDetailCache.get(album.id);
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) {
    return cached.data;
  }

  const dzId =
    album.deezerId ||
    (album.id.startsWith("dz-alb-") ? Number(album.id.replace("dz-alb-", "")) : undefined);
  const itId =
    album.itunesId ||
    (album.id.startsWith("it-alb-") ? Number(album.id.replace("it-alb-", "")) : undefined);

  let tracks: Track[] = [];

  if (dzId) {
    const res = await fetchJsonSafe<{ data?: DeezerTrackRaw[] }>(
      `${getDeezerBaseUrl()}/album/${dzId}/tracks?limit=50`
    );
    tracks = (res?.data || []).map((raw) => ({
      ...mapDeezerTrack(raw),
      album: album.title,
      albumArt: album.image || FALLBACK_ART,
    }));
  }

  if (tracks.length === 0 && itId) {
    const res = await fetchJsonSafe<{ results?: ItunesTrackRaw[] }>(
      `https://itunes.apple.com/lookup?id=${itId}&entity=song&country=IN&limit=50`
    );
    tracks = (res?.results || [])
      .filter((r) => r.wrapperType === "track" || Boolean(r.trackName))
      .map(mapItunesTrack);
  }

  if (tracks.length === 0) {
    tracks = await fetchMergedQueries([`${album.title} ${album.artist}`], 20);
  }

  const data: AlbumDetailData = {
    album,
    tracks: deduplicateTracks(tracks),
  };
  albumDetailCache.set(album.id, { data, at: Date.now() });
  return data;
}
