import React, { useEffect, useState } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { searchMusic } from "../services/musicApi";
import { SearchResults } from "../types/music";

const BROWSE_CARDS = [
  {
    label: "Bollywood Hits",
    query: "Arijit Singh",
    gradient: "from-[#F97316] to-[#E11D48]",
  },
  {
    label: "Hollywood Pop",
    query: "The Weeknd",
    gradient: "from-[#8B5CF6] to-[#EC4899]",
  },
  {
    label: "Punjabi Beats",
    query: "Diljit Dosanjh",
    gradient: "from-[#EAB308] to-[#EA580C]",
  },
  {
    label: "Top Trending",
    query: "Guru Randhawa",
    gradient: "from-[#0EA5E9] to-[#2563EB]",
  },
  {
    label: "Top 100 Global",
    query: "Billie Eilish",
    gradient: "from-[#1DB954] to-[#0D9488]",
  },
  {
    label: "Lo-Fi & Chill",
    query: "Lo-Fi Chill",
    gradient: "from-[#06B6D4] to-[#6366F1]",
  },
];

export const SearchView: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({
    tracks: [],
    artists: [],
    albums: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 pb-8">
      {/* Search Bar */}
      <div className="relative max-w-2xl">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to play?"
          className="w-full rounded-full border border-white/10 bg-[#181818] py-3 pl-12 pr-4 text-sm text-white placeholder-zinc-400 outline-none transition focus:border-[#0EA5E9] focus:bg-[#242424]"
        />
      </div>

      {/* Browse Category Cards when search box is empty */}
      {!query.trim() && (
        <section>
          <h3 className="mb-4 text-lg font-bold text-white">Browse All</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {BROWSE_CARDS.map((card) => (
              <button
                key={card.label}
                onClick={() => setQuery(card.query)}
                className={`relative flex h-28 items-end overflow-hidden rounded-xl bg-gradient-to-br ${card.gradient} p-4 text-left shadow-lg transition hover:scale-[1.02]`}
              >
                <span className="text-base font-extrabold tracking-tight text-white">
                  {card.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#0EA5E9]" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Songs */}
      {!loading && results.tracks.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-white">Songs</h3>
          <div className="rounded-xl bg-[#181818] p-2">
            {results.tracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                contextList={results.tracks}
              />
            ))}
          </div>
        </section>
      )}

      {/* Artists */}
      {!loading && results.artists.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-white">Artists</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {results.artists.map((artist) => (
              <button
                key={artist.id}
                onClick={() => setQuery(artist.name)}
                className="rounded-xl bg-[#181818] p-3 text-center transition hover:bg-[#242424]"
              >
                <img
                  src={artist.image}
                  alt={artist.name}
                  className="mx-auto mb-2.5 aspect-square w-24 rounded-full object-cover shadow"
                  loading="lazy"
                />
                <p className="truncate text-sm font-semibold text-white">
                  {artist.name}
                </p>
                <p className="text-xs text-zinc-400">Artist</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Albums */}
      {!loading && results.albums.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-white">Albums</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.albums.map((album) => (
              <button
                key={album.id}
                onClick={() => setQuery(`${album.title} ${album.artist}`)}
                className="rounded-xl bg-[#181818] p-3 text-left transition hover:bg-[#242424]"
              >
                <img
                  src={album.image}
                  alt={album.title}
                  className="mb-2.5 aspect-square w-full rounded-lg object-cover shadow"
                  loading="lazy"
                />
                <p className="truncate text-sm font-semibold text-white">
                  {album.title}
                </p>
                <p className="truncate text-xs text-zinc-400">{album.artist}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading &&
        query.trim() &&
        !error &&
        results.tracks.length === 0 &&
        results.artists.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-400">
            No results found for "{query}".
          </p>
        )}
    </div>
  );
};
