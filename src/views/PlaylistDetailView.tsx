import React, { useMemo, useState } from "react";
import { ArrowLeft, Clock, Play, Search, Shuffle } from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import { HomeSection } from "../types/music";

interface PlaylistDetailViewProps {
  section: HomeSection;
}

function formatTotalRuntime(totalSecs: number): string {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.round((totalSecs % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${Math.max(1, mins)} min`;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  section,
}) => {
  const { goBack } = useNavigation();
  const { playTrack } = usePlayer();
  const [filterQuery, setFilterQuery] = useState("");

  const filteredTracks = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return section.tracks;
    return section.tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [filterQuery, section.tracks]);

  const totalSecs = useMemo(
    () => section.tracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    [section.tracks]
  );

  const handleShufflePlay = () => {
    if (filteredTracks.length === 0) return;
    const shuffled = [...filteredTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="space-y-6 pb-8">
      <button
        onClick={goBack}
        data-tv-autofocus="true"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Spotify-style Gradient Playlist Hero */}
      <div
        className={`flex flex-col gap-5 rounded-2xl bg-gradient-to-br ${section.gradient} p-6 shadow-xl sm:flex-row sm:items-end`}
      >
        <img
          src={section.coverImage}
          alt={section.title}
          className="h-36 w-36 shrink-0 rounded-xl object-cover shadow-2xl sm:h-44 sm:w-44"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/85">
            {section.category === "charts" ? "Official Chart" : "Curated Playlist"}
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            {section.title}
          </h2>
          <p className="mt-1.5 text-sm text-white/90">{section.subtitle}</p>
          <p className="mt-1 text-xs font-medium text-white/75">
            {section.tracks.length} songs • {formatTotalRuntime(totalSecs)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                filteredTracks.length > 0 &&
                playTrack(filteredTracks[0], filteredTracks)
              }
              className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-105 hover:bg-[#1ed760]"
            >
              <Play className="h-4 w-4 fill-current" />
              Play All
            </button>
            <button
              onClick={handleShufflePlay}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-black/40"
            >
              <Shuffle className="h-4 w-4" />
              Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* Inline Playlist Filter + Table Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Find in playlist..."
            className="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] py-1.5 pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[#0EA5E9]"
          />
        </div>
        <span className="text-xs text-[var(--text-secondary)]">
          Showing {filteredTracks.length} of {section.tracks.length} tracks
        </span>
      </div>

      {/* Spotify-Style Numbered Tracklist Table */}
      <div className="sky-card rounded-xl p-2">
        <div className="mb-1 hidden items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] sm:flex">
          <span className="w-8 text-center">#</span>
          <span className="flex-1">Title &amp; Artist</span>
          <span className="flex items-center gap-2 pr-1">
            <span>Actions</span>
            <Clock className="ml-6 h-3.5 w-3.5" />
          </span>
        </div>

        {filteredTracks.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
            No matching songs in this playlist.
          </p>
        ) : (
          filteredTracks.map((track, idx) => (
            <TrackRow
              key={`${section.id}-${track.id}-${idx}`}
              track={track}
              index={idx}
              contextList={filteredTracks}
            />
          ))
        )}
      </div>
    </div>
  );
};
