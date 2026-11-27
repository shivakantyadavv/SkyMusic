import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ListMusic,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import {
  DownloadTrackButton,
  QualityBadge,
} from "../components/AudioControlsBadges";
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import {
  fetchHomeCatalog,
  fetchPopularArtists,
} from "../services/musicApi";
import { ArtistItem, HomeSection, Track } from "../types/music";
import { getTrackBadgeQuality } from "../utils/audioQuality";
import { onTvCardKeyDown, useTvMode } from "../utils/tvNavigation";

type HomeChip =
  | "all"
  | "charts"
  | "bollywood"
  | "pakistan"
  | "punjabi"
  | "classics"
  | "artists";

const HOME_CHIPS: { id: HomeChip; label: string; opensPlaylistId?: string }[] = [
  { id: "all", label: "All" },
  { id: "charts", label: "Top 100 India", opensPlaylistId: "top-100-india" },
  { id: "pakistan", label: "Pakistan Hits", opensPlaylistId: "hot-hits-pakistan" },
  { id: "bollywood", label: "Bollywood" },
  { id: "punjabi", label: "Punjabi" },
  { id: "classics", label: "90s & Classics" },
  { id: "artists", label: "Artists" },
];

export const HomeView: React.FC = () => {
  const {
    playTrack,
    likedTracks,
    recentlyPlayed,
    clearRecentlyPlayed,
    currentTrack,
    currentTrackQuality,
    activeStreamKind,
    atmosPreset,
  } = usePlayer();
  const { openPlaylist, openArtist } = useNavigation();

  const tvMode = useTvMode();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [artists, setArtists] = useState<ArtistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<HomeChip>("all");

  const loadCatalog = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const seedTracks = [...recentlyPlayed, ...likedTracks];
      const [catalog, popArtists] = await Promise.all([
        fetchHomeCatalog({ force, seedTracks }),
        fetchPopularArtists(force),
      ]);
      setSections(catalog);
      setArtists(popArtists);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load music catalog."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCatalog(false);
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const quickPickSections = useMemo(
    () =>
      sections
        .filter((s) => s.id !== "made-for-you")
        .slice(0, likedTracks.length > 0 ? 5 : 6),
    [likedTracks.length, sections]
  );

  const filteredSections = useMemo(() => {
    if (activeChip === "all") return sections;
    if (activeChip === "artists") return [];
    return sections.filter((s) => s.category === activeChip);
  }, [activeChip, sections]);

  const renderTrackCard = (
    track: Track,
    keyId: string,
    contextTracks: Track[]
  ) => {
    const isCurrent = currentTrack?.id === track.id;
    const quality =
      isCurrent && currentTrackQuality
        ? currentTrackQuality
        : getTrackBadgeQuality(track, false, atmosPreset, activeStreamKind);

    return (
      <div
        key={keyId}
        role="button"
        tabIndex={0}
        onClick={() => playTrack(track, contextTracks)}
        onKeyDown={(e) => onTvCardKeyDown(e, () => playTrack(track, contextTracks))}
        className="sky-card-interactive group w-36 shrink-0 cursor-pointer rounded-xl p-3 sm:w-44"
      >
        <div className="relative mb-3 aspect-square overflow-hidden rounded-lg shadow-lg">
          <img
            src={track.albumArt}
            alt={track.album}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute left-1.5 top-1.5 rounded-full bg-black/75 backdrop-blur-sm">
            <QualityBadge quality={quality} compact />
          </div>
          {!tvMode && (
            <div className="group-focus-reveal absolute right-1.5 top-1.5 rounded-full bg-black/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <DownloadTrackButton track={track} size="sm" onOverlay />
            </div>
          )}
          <div className="group-focus-reveal absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[#1DB954] text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </div>
        </div>
        <p
          className={`truncate text-sm font-semibold ${
            isCurrent ? "text-[#0EA5E9]" : "text-[var(--text-primary)]"
          }`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-[var(--text-secondary)]">
          {track.artist}
        </p>
      </div>
    );
  };

  const renderArtistCard = (artist: ArtistItem, gridLayout = false) => (
    <div
      key={`home-art-${artist.id}`}
      role="button"
      tabIndex={0}
      onClick={() => openArtist(artist)}
      onKeyDown={(e) => onTvCardKeyDown(e, () => openArtist(artist))}
      className={`sky-card-interactive group cursor-pointer rounded-xl p-3 text-center ${
        gridLayout ? "w-full" : "w-32 shrink-0 sm:w-40"
      }`}
    >
      <div className="relative mx-auto mb-2.5 aspect-square w-24 overflow-hidden rounded-full shadow-lg sm:w-28">
        <img
          src={artist.image}
          alt={artist.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
        {artist.name}
      </p>
      <p className="truncate text-[11px] text-[var(--text-secondary)]">
        {artist.genre || "Artist"}
      </p>
    </div>
  );

  return (
    <div className="space-y-8 pb-8">
      {/* Top Greeting + Refresh + Filter Chips */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-3xl">
              {greeting()}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              India &amp; Pakistan Charts • Bollywood, Coke Studio, Punjabi &amp; Classics
            </p>
          </div>
          <button
            onClick={() => loadCatalog(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)] disabled:opacity-60"
            title="Mix fresh suggestions"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                loading || refreshing ? "animate-spin" : ""
              }`}
            />
            {refreshing ? "Mixing..." : "Refresh Mix"}
          </button>
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {HOME_CHIPS.map((chip) => {
            const selected = activeChip === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => {
                  if (chip.opensPlaylistId) {
                    const target = sections.find((s) => s.id === chip.opensPlaylistId);
                    if (target) {
                      openPlaylist(target);
                      return;
                    }
                  }
                  setActiveChip(chip.id);
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? chip.id === "all"
                      ? "bg-[var(--chip-active-bg)] text-[var(--chip-active-fg)] shadow-sm"
                      : "bg-[#1DB954] text-black shadow-sm"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="sky-card flex h-64 items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#0EA5E9]" />
            <p className="text-xs text-[var(--text-secondary)]">
              Loading Top 100 India, Hot Hits Pakistan, Bollywood &amp; Artists...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="sky-card rounded-xl p-6 text-center text-sm text-[var(--text-secondary)]">
          <p>{error}</p>
          <button
            onClick={() => loadCatalog(true)}
            className="mt-3 rounded-full bg-[#0EA5E9] px-4 py-1.5 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : activeChip === "artists" ? (
        /* Dedicated Artists Directory Grid */
        <section className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              India &amp; Pakistan Star Artists
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Click any singer to view their full profile, top songs &amp; albums
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {artists.map((art) => renderArtistCard(art, true))}
          </div>
        </section>
      ) : (
        <>
          {/* Quick-Pick Compact Charts Grid (Click opens full Spotify numbered Playlist!) */}
          {activeChip === "all" && (
            <section>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {quickPickSections.map((sec) => (
                  <div
                    key={sec.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPlaylist(sec)}
                    onKeyDown={(e) =>
                      onTvCardKeyDown(e, () => openPlaylist(sec))
                    }
                    className="sky-card-interactive group flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg pr-3"
                  >
                    <div
                      className={`relative h-14 w-14 shrink-0 bg-gradient-to-br ${sec.gradient}`}
                    >
                      <img
                        src={sec.coverImage}
                        alt={sec.title}
                        className="h-full w-full object-cover opacity-90"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                        {sec.title}
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-secondary)]">
                        {sec.tracks.length} songs
                      </p>
                    </div>
                    {!tvMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playTrack(sec.tracks[0], sec.tracks);
                        }}
                        className="group-focus-reveal flex h-9 w-9 shrink-0 translate-y-1 items-center justify-center rounded-full bg-[#1DB954] text-black opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100"
                        title={`Play ${sec.title}`}
                      >
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      </button>
                    )}
                  </div>
                ))}

                {likedTracks.length > 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      openPlaylist({
                        id: "liked-collection",
                        title: "Liked Songs",
                        subtitle: "Your saved favorite tracks",
                        gradient: "from-[#0EA5E9] to-[#1DB954]",
                        coverImage: likedTracks[0].albumArt,
                        tracks: likedTracks,
                      })
                    }
                    onKeyDown={(e) =>
                      onTvCardKeyDown(e, () =>
                        playTrack(likedTracks[0], likedTracks)
                      )
                    }
                    className="sky-card-interactive group flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg pr-3"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br from-[#0EA5E9] to-[#1DB954]">
                      <Play className="h-6 w-6 fill-white text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                        Liked Songs
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-secondary)]">
                        {likedTracks.length} saved songs
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Horizontal Recently Played Row (right above Top Trending) */}
          {activeChip === "all" && recentlyPlayed.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    Recently Played
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Jump back into your latest tracks
                  </p>
                </div>
                <button
                  onClick={clearRecentlyPlayed}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {recentlyPlayed.map((track) =>
                  renderTrackCard(track, `recent-${track.id}`, recentlyPlayed)
                )}
              </div>
            </section>
          )}

          {/* Popular Artists (India & Pakistan) -> Click opens full Artist Profile! */}
          {activeChip === "all" && artists.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    Popular Artists • India &amp; Pakistan
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Arijit Singh, Vishal Mishra, Atif Aslam, Sonu Nigam, Diljit &amp; more
                  </p>
                </div>
                <button
                  onClick={() => setActiveChip("artists")}
                  className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  See all
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {artists.map((art) => renderArtistCard(art, false))}
              </div>
            </section>
          )}

          {/* Spotify Playlist / Chart Cards Row (Click opens 50-100 track Spotify table!) */}
          {activeChip === "all" && sections.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  Top Charts &amp; Curated Playlists
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Open any chart to browse full 80–100 song lists just like Spotify
                </p>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {sections
                  .filter((s) => s.id !== "made-for-you")
                  .map((sec) => (
                    <div
                      key={`pl-card-${sec.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openPlaylist(sec)}
                      onKeyDown={(e) =>
                        onTvCardKeyDown(e, () => openPlaylist(sec))
                      }
                      className="sky-card-interactive group w-40 shrink-0 cursor-pointer rounded-xl p-3 sm:w-44"
                    >
                      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg shadow-lg">
                        <img
                          src={sec.coverImage}
                          alt={sec.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                          <ListMusic className="h-3 w-3 text-[#1DB954]" />
                          {sec.tracks.length}
                        </span>
                        <div className="group-focus-reveal absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[#1DB954] text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
                          <Play className="ml-0.5 h-5 w-5 fill-current" />
                        </div>
                      </div>
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                        {sec.title}
                      </p>
                      <p className="line-clamp-1 text-xs text-[var(--text-secondary)]">
                        {sec.subtitle}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Rich Horizontal Scrollable Song Recommendation Shelves (12+ songs per shelf + Open Full List button) */}
          {filteredSections.map((sec) => (
            <section key={sec.id} className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    {sec.title}
                  </h3>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {sec.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => openPlaylist(sec)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
                >
                  Open {sec.tracks.length} Songs
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {sec.tracks
                  .slice(0, 14)
                  .map((track) =>
                    renderTrackCard(track, `${sec.id}-${track.id}`, sec.tracks)
                  )}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
