export type RepeatMode = "off" | "all" | "one";
export type NavTab = "home" | "search" | "library" | "settings";
export type AtmosPreset = "music" | "movie" | "bass" | "off";
export type AudioQualityTier =
  | "lossless"
  | "atmos"
  | "hq"
  | "preview"
  | "unknown";

export interface AudioQualityInfo {
  badge: string;
  detail: string;
  codec?: string;
  bitrateKbps?: number;
  sampleRateHz?: number;
  bitDepth?: number;
  tier: AudioQualityTier;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number; // seconds
  streamUrl: string | null; // preview fallback URL or local file URL
  source: "deezer" | "itunes" | "local" | "downloaded";
  externalUrl?: string;
  localPath?: string;
  fileName?: string;
  downloadedAt?: number;
  quality?: AudioQualityInfo;
  ytVideoId?: string;
}

export interface DownloadProgressPayload {
  trackId: string;
  progress: number;
  status: "resolving" | "downloading" | "tagging" | "completed" | "error";
  error?: string;
}

export interface DownloadedTrackResult {
  trackId: string;
  filePath: string;
  fileName: string;
  localStreamUrl: string;
  mimeType: string;
  quality: AudioQualityInfo;
  duration: number;
}

export interface ArtistItem {
  id: string;
  name: string;
  image: string;
  followers?: string;
  source: "deezer" | "itunes";
}

export interface AlbumItem {
  id: string;
  title: string;
  artist: string;
  image: string;
  releaseDate?: string;
  source: "deezer" | "itunes";
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  tracks: Track[];
  createdAt: number;
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle: string;
  gradient: string;
  coverImage: string;
  tracks: Track[];
}

export interface SearchResults {
  tracks: Track[];
  artists: ArtistItem[];
  albums: AlbumItem[];
}
