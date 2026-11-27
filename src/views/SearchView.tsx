import React, { useEffect, useState } from "react";
import { BadgeCheck, Loader2, Mic, Play, Search as SearchIcon } from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import {
  fetchPopularArtists,
  searchMusic,
} from "../services/musicApi";
import { ArtistItem, SearchResults } from "../types/music";
import {
  focusPrimaryInScope,
  hasTvVoiceSearch,
  onTvCardKeyDown,
  startTvVoiceSearch,
  useTvMode,
} from "../utils/tvNavigation";

const BROWSE_CARDS = [
  {
    label: "Arijit Singh Hits",
    query: "Arijit Singh",
    gradient: "from-[#F97316] to-[#E11D48]",
  },
  {
    label: "Vishal Mishra",
    query: "Vishal Mishra",
    gradient: "from-[#0EA5E9] to-[#2563EB]",
  },
  {
    label: "Atif Aslam",
    query: "Atif Aslam",
    gradient: "from-[#1DB954] to-[#0D9488]",
  },
  {
    label: "Sonu Nigam",
    query: "Sonu Nigam",
    gradient: "from-[#6366F1] to-[#8B5CF6]",
  },
  {
    label: "Diljit Dosanjh",
    query: "Diljit Dosanjh",
    gradient: "from-[#EAB308] to-[#EA580C]",
  },
  {
    label: "Coke Studio Pakistan",
    query: "Coke Studio Pakistan",
    gradient: "from-[#10B981] to-[#047857]",
  },
  {
    label: "90s Bollywood",
    query: "90s Bollywood Kumar Sanu Udit Narayan",
    gradient: "from-[#EC4899] to-[#F43F5E]",
  },
  {
    label: "Talha Anjum & DHH",
    query: "Talha Anjum",
    gradient: "from-[#06B6D4] to-[#4F46E5]",
  },
];

export const SearchView: React.FC = () => {
  const { openArtist, openAlbum } = useNavigation();
  const { playTrack } = usePlayer();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({
    tracks: [],
    artists: [],
    albums: [],
  });
  const [popularArtists, setPopularArtists] = useState<ArtistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tvMode = useTvMode();
  const voiceSupported = hasTvVoiceSearch();

  // Preload verified India & Pakistan singer profiles for empty browse state
  useEffect(() => {
    fetchPopularArtists(false)
      .then((list) => setPopularArtists(list.slice(0, 12)))
      .catch(() => {});
  }, []);

  // Receive Android TV Google Assistant / Mic voice search transcription
  useEffect(() => {
    const onVoice = (e: Event) => {
      const spoken = (e as CustomEvent<string>).detail;
      if (typeof spoken === "string" && spoken.trim()) {
        setQuery(spoken.trim());
      }
    };
    window.addEventListener("skymusic-voice-search", onVoice);
    return () => window.removeEventListener("skymusic-voice-search", onVoice);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ tracks: [], artists: [], albums: [] });
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchMusic(trimmed);
        setResults(res);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Search failed. Please check your internet connection."
        );
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [query]);

  const topArtist = results.artists[0] || null;
  const normalizedQuery = query.trim().toLowerCase();
  const showArtistTopResult = Boolean(
    topArtist &&
      normalizedQuery &&
      (topArtist.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(topArtist.name.toLowerCase()))
  );

  return (
    <div className="space-y-7 pb-8">
      {/* Search Bar + Optional Android TV Voice Search Mic */}
      <div className="flex max-w-2xl items-center gap-2.5">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tvMode) {
                e.preventDefault();
                e.currentTarget.blur();
                window.setTimeout(() => focusPrimaryInScope(), 80);
              }
            }}
            placeholder="Search songs, Arijit Singh, Vishal Mishra, Atif Aslam..."
            className="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] py-3 pl-12 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] shadow-sm outline-none transition focus:border-[#0EA5E9] focus:bg-[var(--bg-card-hover)]"
            style={{
              backdropFilter: "var(--backdrop-blur)",
              WebkitBackdropFilter: "var(--backdrop-blur)",
            }}
          />
        </div>

        {voiceSupported && (
          <button
            type="button"
            onClick={() => startTvVoiceSearch()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[#0EA5E9] text-white shadow-lg shadow-[#0EA5E9]/25 transition hover:bg-[#0284C7]"
            title="Voice Search with TV Remote"
            aria-label="Voice Search"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Browse Popular Indian & Pakistani Artists + Moods when search is empty */}
      {!query.trim() && (
        <div className="space-y-8">
          {popularArtists.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  Artist Profiles • India &amp; Pakistan
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Open any artist profile to see all their top songs &amp; albums
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {popularArtists.map((artist) => (
                  <button
                    key={`search-pop-${artist.id}`}
                    onClick={() => openArtist(artist)}
                    className="sky-card-interactive rounded-xl p-3 text-center"
                  >
                    <img
                      src={artist.image}
                      alt={artist.name}
                      className="mx-auto mb-2 aspect-square w-20 rounded-full object-cover shadow"
                      loading="lazy"
                    />
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {artist.name}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">
                      {artist.genre || "Artist"}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Browse Categories
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {BROWSE_CARDS.map((card) => (
                <button
                  key={card.label}
                  onClick={() => setQuery(card.query)}
                  className={`relative flex h-24 items-end overflow-hidden rounded-xl bg-gradient-to-br ${card.gradient} p-4 text-left shadow-lg transition hover:scale-[1.02]`}
                >
                  <span className="text-base font-extrabold tracking-tight text-white">
                    {card.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#0EA5E9]" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-medium text-red-500">
          {error}
        </div>
      )}

      {/* Spotify-Style Top Result + Songs Split Header */}
      {!loading && (showArtistTopResult || results.tracks.length > 0) && (
        <section className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {showArtistTopResult && topArtist && (
            <div className="md:col-span-5">
              <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">
                Top Result
              </h3>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openArtist(topArtist)}
                onKeyDown={(e) =>
                  onTvCardKeyDown(e, () => openArtist(topArtist))
                }
                className="sky-card-interactive group flex h-[calc(100%-2.25rem)] cursor-pointer flex-col justify-between rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <img
                    src={topArtist.image}
                    alt={topArtist.name}
                    className="h-24 w-24 rounded-full object-cover shadow-xl"
                  />
                  {results.tracks.length > 0 && !tvMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(results.tracks[0], results.tracks);
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1DB954] text-black shadow-lg transition hover:scale-105"
                      title={`Play ${topArtist.name}`}
                    >
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <h4 className="truncate text-2xl font-extrabold text-[var(--text-primary)]">
                    {topArtist.name}
                  </h4>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#0EA5E9]/20 px-2.5 py-0.5 text-xs font-bold text-[#38bdf8]">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Artist Profile
                    </span>
                    {topArtist.followers && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {topArtist.followers}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {results.tracks.length > 0 && (
            <div className={showArtistTopResult ? "md:col-span-7" : "md:col-span-12"}>
              <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">
                Songs
              </h3>
              <div className="sky-card rounded-xl p-2">
                {(showArtistTopResult
                  ? results.tracks.slice(0, 4)
                  : results.tracks.slice(0, 12)
                ).map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    contextList={results.tracks}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Artists (Opens full Artist Profile with all songs & albums!) */}
      {!loading && results.artists.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">
            Artists
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {results.artists.map((artist) => (
              <button
                key={artist.id}
                onClick={() => openArtist(artist)}
                className="sky-card-interactive rounded-xl p-3 text-center"
              >
                <img
                  src={artist.image}
                  alt={artist.name}
                  className="mx-auto mb-2.5 aspect-square w-24 rounded-full object-cover shadow"
                  loading="lazy"
                />
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {artist.name}
                </p>
                <p className="truncate text-xs text-[var(--text-secondary)]">
                  {artist.followers || artist.genre || "Artist"}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Albums (Opens full Album tracklist!) */}
      {!loading && results.albums.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">
            Albums
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.albums.map((album) => (
              <button
                key={album.id}
                onClick={() => openAlbum(album)}
                className="sky-card-interactive rounded-xl p-3 text-left"
              >
                <img
                  src={album.image}
                  alt={album.title}
                  className="mb-2.5 aspect-square w-full rounded-lg object-cover shadow"
                  loading="lazy"
                />
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {album.title}
                </p>
                <p className="truncate text-xs text-[var(--text-secondary)]">
                  {album.artist}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* More Matching Songs below Top Result */}
      {!loading && showArtistTopResult && results.tracks.length > 4 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">
            More Songs
          </h3>
          <div className="sky-card rounded-xl p-2">
            {results.tracks.slice(4).map((track, idx) => (
              <TrackRow
                key={`more-${track.id}-${idx}`}
                track={track}
                index={idx + 4}
                contextList={results.tracks}
              />
            ))}
          </div>
        </section>
      )}

      {!loading &&
        query.trim() &&
        !error &&
        results.tracks.length === 0 &&
        results.artists.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--text-secondary)]">
            No results found for "{query}".
          </p>
        )}
    </div>
  );
};
