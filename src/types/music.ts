export type RepeatMode = "off" | "all" | "one";
export type NavTab = "home" | "search" | "library" | "settings";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number; // seconds
  streamUrl: string | null; // preview fallback URL or local file URL
  source: "deezer" | "itunes" | "local";
  externalUrl?: string;
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
