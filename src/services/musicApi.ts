import {
  AlbumItem,
  ArtistItem,
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
  };
  album: {
    id: number;
    title: string;
    cover_medium?: string;
    cover_big?: string;
    cover_xl?: string;
  };
}

interface ItunesTrackRaw {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionId: number;
  collectionName: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
}

const FALLBACK_ART =
  "https://images.unsplash.com/photo-1614613535768-5e830bb27e3d?w=500&q=80";

function getDeezerBaseUrl(): string {
  return isTauriEnv() ? "https://api.deezer.com" : "/api/deezer";
}

function mapDeezerTrack(item: DeezerTrackRaw): Track {
  return {
    id: `dz-${item.id}`,
    title: item.title,
    artist: item.artist?.name || "Unknown Artist",
    album: item.album?.title || "Single",
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
    album: item.collectionName || "Single",
    albumArt: highResArt,
    duration: item.trackTimeMillis
      ? Math.round(item.trackTimeMillis / 1000)
      : 180,
    streamUrl: item.previewUrl || null,
    source: "itunes",
    externalUrl: item.trackViewUrl,
  };
}

export async function searchMusic(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { tracks: [], artists: [], albums: [] };
  }

  const encoded = encodeURIComponent(trimmed);
  const deezerUrl = `${getDeezerBaseUrl()}/search?q=${encoded}&limit=15`;
  const itunesUrl = `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&limit=15`;

  const [deezerRes, itunesRes] = await Promise.allSettled([
    smartFetch(deezerUrl).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    smartFetch(itunesUrl).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ]);

  const tracks: Track[] = [];
  const artistMap = new Map<string, ArtistItem>();
  const albumMap = new Map<string, AlbumItem>();

  if (deezerRes.status === "fulfilled" && Array.isArray(deezerRes.value?.data)) {
    for (const raw of deezerRes.value.data as DeezerTrackRaw[]) {
      const mapped = mapDeezerTrack(raw);
      tracks.push(mapped);

      if (raw.artist && !artistMap.has(`dz-${raw.artist.id}`)) {
        artistMap.set(`dz-${raw.artist.id}`, {
          id: `dz-art-${raw.artist.id}`,
          name: raw.artist.name,
          image:
            raw.artist.picture_big ||
            raw.artist.picture_medium ||
            mapped.albumArt,
          source: "deezer",
        });
      }
      if (raw.album && !albumMap.has(`dz-${raw.album.id}`)) {
        albumMap.set(`dz-${raw.album.id}`, {
          id: `dz-alb-${raw.album.id}`,
          title: raw.album.title,
          artist: raw.artist?.name || "Unknown",
          image:
            raw.album.cover_xl ||
            raw.album.cover_big ||
            raw.album.cover_medium ||
            mapped.albumArt,
          source: "deezer",
        });
      }
    }
  }

  if (itunesRes.status === "fulfilled" && Array.isArray(itunesRes.value?.results)) {
    for (const raw of itunesRes.value.results as ItunesTrackRaw[]) {
      const mapped = mapItunesTrack(raw);
      const duplicate = tracks.some(
        (t) =>
          t.title.toLowerCase() === mapped.title.toLowerCase() &&
          t.artist.toLowerCase() === mapped.artist.toLowerCase()
      );
      if (!duplicate) {
        tracks.push(mapped);
      }
      if (raw.collectionId && !albumMap.has(`it-${raw.collectionId}`)) {
        albumMap.set(`it-${raw.collectionId}`, {
          id: `it-alb-${raw.collectionId}`,
          title: raw.collectionName,
          artist: raw.artistName,
          image: mapped.albumArt,
          source: "itunes",
        });
      }
    }
  }

  return {
    tracks,
    artists: Array.from(artistMap.values()).slice(0, 8),
    albums: Array.from(albumMap.values()).slice(0, 8),
  };
}

async function fetchDeezerPlaylistTracks(
  playlistId: string,
  limit = 16
): Promise<Track[]> {
  try {
    const res = await smartFetch(
      `${getDeezerBaseUrl()}/playlist/${playlistId}/tracks?limit=${limit}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json?.data)) return [];
    return (json.data as DeezerTrackRaw[]).map(mapDeezerTrack);
  } catch {
    return [];
  }
}

async function fetchMergedQueries(
  queries: string[],
  maxTracks = 16
): Promise<Track[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchMusic(q)));
  const merged: Track[] = [];
  const seen = new Set<string>();

  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const track of res.value.tracks.slice(0, 6)) {
      const key = `${track.title.toLowerCase()}::${track.artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(track);
      }
    }
  }

  return merged.slice(0, maxTracks);
}

export async function fetchHomeCatalog(): Promise<HomeSection[]> {
  const [top100Raw, punjabiPl, hollywoodPl, bollywoodTracks, trendingTracks] =
    await Promise.all([
      fetchDeezerPlaylistTracks("3155776842", 20),
      fetchDeezerPlaylistTracks("15815833201", 16),
      fetchDeezerPlaylistTracks("16009366863", 16),
      fetchMergedQueries(
        ["arijit singh", "pritam", "shreya ghoshal", "atif aslam"],
        16
      ),
      fetchMergedQueries(
        ["diljit dosanjh", "the weeknd", "arijit singh kesariya", "sabrina carpenter"],
        16
      ),
    ]);

  const top100Tracks =
    top100Raw.length > 0
      ? top100Raw
      : await fetchMergedQueries(
          ["the weeknd", "taylor swift", "billie eilish", "bruno mars"],
          16
        );

  const punjabiTracks =
    punjabiPl.length > 0
      ? punjabiPl
      : await fetchMergedQueries(
          ["diljit dosanjh", "guru randhawa", "ap dhillon", "karan aujla"],
          16
        );

  const hollywoodTracks =
    hollywoodPl.length > 0
      ? hollywoodPl
      : await fetchMergedQueries(
          ["the weeknd", "dua lipa", "billie eilish", "post malone"],
          16
        );

  const sections: HomeSection[] = [
    {
      id: "top-trending",
      title: "Top Trending",
      subtitle: "Most played tracks right now",
      gradient: "from-[#0EA5E9] to-[#2563EB]",
      coverImage: trendingTracks[0]?.albumArt || FALLBACK_ART,
      tracks: trendingTracks,
    },
    {
      id: "top-100",
      title: "Top 100 Global",
      subtitle: "Worldwide chartbusters & hits",
      gradient: "from-[#1DB954] to-[#0D9488]",
      coverImage: top100Tracks[0]?.albumArt || FALLBACK_ART,
      tracks: top100Tracks,
    },
    {
      id: "bollywood",
      title: "Bollywood Hits",
      subtitle: "Arijit Singh, Pritam, Shreya Ghoshal & more",
      gradient: "from-[#F97316] to-[#E11D48]",
      coverImage: bollywoodTracks[0]?.albumArt || FALLBACK_ART,
      tracks: bollywoodTracks,
    },
    {
      id: "hollywood",
      title: "Hollywood Hits",
      subtitle: "Pop, R&B & global chart favorites",
      gradient: "from-[#8B5CF6] to-[#EC4899]",
      coverImage: hollywoodTracks[0]?.albumArt || FALLBACK_ART,
      tracks: hollywoodTracks,
    },
    {
      id: "punjabi",
      title: "Punjabi Hits",
      subtitle: "Diljit Dosanjh, AP Dhillon, Karan Aujla & Shubh",
      gradient: "from-[#EAB308] to-[#EA580C]",
      coverImage: punjabiTracks[0]?.albumArt || FALLBACK_ART,
      tracks: punjabiTracks,
    },
  ];

  return sections.filter((s) => s.tracks.length > 0);
}
