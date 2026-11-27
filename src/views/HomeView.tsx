import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { usePlayer } from "../context/PlayerContext";
import { fetchHomeCatalog } from "../services/musicApi";
import { HomeSection } from "../types/music";

export const HomeView: React.FC = () => {
  const { playTrack, likedTracks } = usePlayer();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(
    null
  );

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHomeCatalog();
      setSections(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load music catalog."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const expandedSection = sections.find((s) => s.id === expandedSectionId);

  const visibleSections =
    activeFilter === "all"
      ? sections
      : sections.filter((s) => s.id === activeFilter);

  if (expandedSection) {
    return (
      <div className="space-y-6 pb-8">
        <button
          onClick={() => setExpandedSectionId(null)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        {/* Category Playlist Hero */}
        <div
          className={`flex flex-col gap-5 rounded-2xl bg-gradient-to-br ${expandedSection.gradient} p-6 shadow-xl sm:flex-row sm:items-end`}
        >
          <img
            src={expandedSection.coverImage}
            alt={expandedSection.title}
            className="h-36 w-36 shrink-0 rounded-xl object-cover shadow-2xl sm:h-44 sm:w-44"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">
              Curated Collection
            </p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              {expandedSection.title}
            </h2>
            <p className="mt-1.5 text-sm text-white/85">
              {expandedSection.subtitle} • {expandedSection.tracks.length} songs
            </p>
            <button
              onClick={() =>
                playTrack(expandedSection.tracks[0], expandedSection.tracks)
              }
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-105 hover:bg-[#1ed760]"
            >
              <Play className="h-4 w-4 fill-current" />
              Play All
            </button>
          </div>
        </div>

        <div className="sky-card rounded-xl p-2">
          {expandedSection.tracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              contextList={expandedSection.tracks}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Top Greeting + Category Filter Chips (Spotify Style) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-3xl">
            {greeting()}
          </h2>
          <button
            onClick={loadCatalog}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
            title="Refresh Home"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeFilter === "all"
                ? "bg-[var(--chip-active-bg)] text-[var(--chip-active-fg)] shadow-sm"
                : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
            }`}
          >
            All
          </button>
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveFilter(sec.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeFilter === sec.id
                  ? "bg-[#1DB954] text-black shadow-sm"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
              }`}
            >
              {sec.title}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="sky-card flex h-64 items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#0EA5E9]" />
            <p className="text-xs text-[var(--text-secondary)]">
              Loading Bollywood, Hollywood, Punjabi &amp; Global Charts...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="sky-card rounded-xl p-6 text-center text-sm text-[var(--text-secondary)]">
          <p>{error}</p>
          <button
            onClick={loadCatalog}
            className="mt-3 rounded-full bg-[#0EA5E9] px-4 py-1.5 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Quick-Pick Compact Suggestion Cards Grid (Spotify Top 6 Grid) */}
          {activeFilter === "all" && (
            <section>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {sections.map((sec) => (
                  <div
                    key={sec.id}
                    onClick={() => setExpandedSectionId(sec.id)}
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
                        {sec.tracks.length} tracks
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(sec.tracks[0], sec.tracks);
                      }}
                      className="flex h-9 w-9 shrink-0 translate-y-1 items-center justify-center rounded-full bg-[#1DB954] text-black opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100"
                      title={`Play ${sec.title}`}
                    >
                      <Play className="ml-0.5 h-4 w-4 fill-current" />
                    </button>
                  </div>
                ))}

                {likedTracks.length > 0 && (
                  <div
                    onClick={() => playTrack(likedTracks[0], likedTracks)}
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

          {/* Spotify-Style Suggestion Card Shelves */}
          {visibleSections.map((sec) => (
            <section key={sec.id} className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <h3
                    onClick={() => setExpandedSectionId(sec.id)}
                    className="cursor-pointer text-xl font-bold tracking-tight text-[var(--text-primary)] hover:underline"
                  >
                    {sec.title}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {sec.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedSectionId(sec.id)}
                  className="inline-flex items-center gap-0.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Show all
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {sec.tracks.slice(0, 6).map((track) => (
                  <div
                    key={`${sec.id}-${track.id}`}
                    onClick={() => playTrack(track, sec.tracks)}
                    className="sky-card-interactive group cursor-pointer rounded-xl p-3"
                  >
                    <div className="relative mb-3 aspect-square overflow-hidden rounded-lg shadow-lg">
                      <img
                        src={track.albumArt}
                        alt={track.album}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[#1DB954] text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </div>
                    </div>
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {track.artist}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
