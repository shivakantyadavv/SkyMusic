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
  artistId?: number;
  albumId?: string;
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
  fans?: number;
  genre?: string;
  deezerId?: number;
  itunesId?: number;
  source: "deezer" | "itunes";
}

export interface AlbumItem {
  id: string;
  title: string;
  artist: string;
  image: string;
  releaseDate?: string;
  trackCount?: number;
  deezerId?: number;
  itunesId?: number;
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
  category?: "charts" | "bollywood" | "pakistan" | "punjabi" | "classics" | "mix";
  tracks: Track[];
}

export interface ArtistProfileData {
  artist: ArtistItem;
  topTracks: Track[];
  albums: AlbumItem[];
  relatedArtists: ArtistItem[];
}

export interface AlbumDetailData {
  album: AlbumItem;
  tracks: Track[];
}

export interface SearchResults {
  tracks: Track[];
  artists: ArtistItem[];
  albums: AlbumItem[];
}

export type DetailRoute =
  | { type: "playlist"; section: HomeSection }
  | { type: "artist"; artist: ArtistItem }
  | { type: "album"; album: AlbumItem };

export type SyncThemeMode = "dark" | "light" | "glass";
export type SyncTombstoneMap = Record<string, number>;

export interface SyncContinueListening {
  track: Track | null;
  position: number;
  duration: number;
  isPlaying: boolean;
  deviceId: string;
  deviceName: string;
  updatedAt: number;
}

export interface SyncPreferences {
  theme: SyncThemeMode;
  atmosPreset: AtmosPreset;
  updatedAt: number;
}

export interface SyncSnapshot {
  version: 1;
  updatedAt: number;
  updatedByDeviceId: string;
  updatedByDeviceName: string;
  likedTracks: Track[];
  likedTrackAddedAt: Record<string, number>;
  deletedLikedAt: SyncTombstoneMap;
  playlists: Playlist[];
  playlistUpdatedAt: Record<string, number>;
  deletedPlaylistsAt: SyncTombstoneMap;
  recentlyPlayed: Track[];
  recentlyPlayedAt: Record<string, number>;
  preferences: SyncPreferences;
  continueListening: SyncContinueListening | null;
}

export interface LanNowPlayingSummary {
  title: string;
  artist: string;
  artwork?: string | null;
  trackId?: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
}

export interface LanDeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  ip: string;
  port: number;
  roomId?: string | null;
  requiresPin: boolean;
  nowPlaying?: LanNowPlayingSummary | null;
  updatedAt: number;
  lastSeenMs: number;
}

export interface LanDiscoveryResult {
  selfInfo: LanDeviceInfo;
  peers: LanDeviceInfo[];
}

export type LanCastAction =
  | "play_track"
  | "play"
  | "pause"
  | "toggle"
  | "next"
  | "prev"
  | "seek"
  | "set_volume"
  | "set_atmos"
  | "sync_now";

export interface LanCastCommand {
  action: LanCastAction;
  fromDeviceId: string;
  fromDeviceName: string;
  track?: Track | null;
  queue?: Track[] | null;
  position?: number | null;
  volume?: number | null;
  muted?: boolean | null;
  atmosPreset?: AtmosPreset | null;
  pin?: string | null;
  timestamp: number;
}

export interface SyncDevicePresence {
  deviceId: string;
  deviceName: string;
  platform: "desktop" | "tv" | "mobile";
  appVersion: string;
  nowPlaying?: LanNowPlayingSummary | null;
  lastSeenAt: number;
}
