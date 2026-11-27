import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Disc,
  Loader2,
  Play,
  Shuffle,
} from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import { fetchArtistProfile } from "../services/musicApi";
import { ArtistItem, ArtistProfileData } from "../types/music";
import { onTvCardKeyDown, useTvMode } from "../utils/tvNavigation";

interface ArtistProfileViewProps {
  artist: ArtistItem;
}

export const ArtistProfileView: React.FC<ArtistProfileViewProps> = ({
  artist,
}) => {
  const { goBack, openAlbum, openArtist } = useNavigation();
  const { playTrack } = usePlayer();
  const tvMode = useTvMode();

  const [profile, setProfile] = useState<ArtistProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllSongs, setShowAllSongs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setShowAllSongs(false);
    fetchArtistProfile(artist)
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artist.id, artist.name]);

  const info = profile?.artist || artist;
  const topTracks = profile?.topTracks || [];
  const visibleTracks = showAllSongs ? topTracks : topTracks.slice(0, 15);
  const albums = profile?.albums || [];
  const related = profile?.relatedArtists || [];

  const handleShuffle = () => {
    if (topTracks.length === 0) return;
    const shuffled = [...topTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="space-y-7 pb-10">
      <button
        onClick={goBack}
        data-tv-autofocus="true"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Spotify Verified Artist Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[#0EA5E9]/35 via-[#161a1f] to-[#1DB954]/25 p-6 shadow-xl">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
          <img
            src={info.image}
            alt={info.name}
            className="h-36 w-36 shrink-0 rounded-full object-cover shadow-2xl ring-2 ring-white/20 sm:h-44 sm:w-44"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0EA5E9]/20 px-3 py-1 text-xs font-bold text-[#38bdf8]">
              <BadgeCheck className="h-4 w-4 fill-[#0EA5E9] text-white" />
              Verified Artist
            </div>
            <h2 className="mt-2 truncate text-3xl font-extrabold tracking-tight text-white md:text-5xl">
              {info.name}
            </h2>
            <p className="mt-1.5 text-sm text-white/80">
              {[info.genre, info.followers, topTracks.length > 0 ? `${topTracks.length} songs loaded` : null]
                .filter(Boolean)
                .join(" • ")}
            </p>

            {topTracks.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <button
                  onClick={() => playTrack(topTracks[0], topTracks)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-105 hover:bg-[#1ed760]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play Popular
                </button>
                <button
                  onClick={handleShuffle}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-black/45"
                >
                  <Shuffle className="h-4 w-4" />
                  Shuffle
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="sky-card flex h-56 flex-col items-center justify-center gap-3 rounded-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-[#0EA5E9]" />
          <p className="text-xs text-[var(--text-secondary)]">
            Loading {info.name}&apos;s top songs, albums &amp; similar artists...
          </p>
        </div>
      ) : (
        <>
          {/* Popular Songs */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[var(--text-primary)]">
                Popular Songs ({topTracks.length})
              </h3>
              {topTracks.length > 15 && (
                <button
                  onClick={() => setShowAllSongs((prev) => !prev)}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-1 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                >
                  {showAllSongs ? "Show Top 15" : `See All ${topTracks.length} Songs`}
                </button>
              )}
            </div>

            {topTracks.length === 0 ? (
              <div className="sky-card rounded-xl p-8 text-center text-sm text-[var(--text-secondary)]">
                No tracks found for {info.name}.
              </div>
            ) : (
              <div className="sky-card rounded-xl p-2">
                {visibleTracks.map((track, idx) => (
                  <TrackRow
                    key={`art-trk-${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    contextList={topTracks}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Discography / Albums */}
          {albums.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Disc className="h-5 w-5 text-[#0EA5E9]" />
                <h3 className="text-xl font-bold text-[var(--text-primary)]">
                  Albums &amp; Singles
                </h3>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {albums.slice(0, tvMode ? 10 : 16).map((alb) => (
                  <div
                    key={alb.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openAlbum(alb)}
                    onKeyDown={(e) => onTvCardKeyDown(e, () => openAlbum(alb))}
                    className="sky-card-interactive w-36 shrink-0 cursor-pointer rounded-xl p-3 sm:w-44"
                  >
                    <img
                      src={alb.image}
                      alt={alb.title}
                      className="mb-2.5 aspect-square w-full rounded-lg object-cover shadow"
                      loading="lazy"
                    />
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {alb.title}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {alb.releaseDate ? alb.releaseDate.slice(0, 4) : "Album"}
                      {alb.trackCount ? ` • ${alb.trackCount} tracks` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fans Also Like */}
          {related.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xl font-bold text-[var(--text-primary)]">
                Fans Also Like
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                {related.map((rel) => (
                  <div
                    key={rel.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openArtist(rel)}
                    onKeyDown={(e) => onTvCardKeyDown(e, () => openArtist(rel))}
                    className="sky-card-interactive w-36 shrink-0 cursor-pointer rounded-xl p-3 text-center sm:w-40"
                  >
                    <img
                      src={rel.image}
                      alt={rel.name}
                      className="mx-auto mb-2.5 aspect-square w-24 rounded-full object-cover shadow-lg"
                      loading="lazy"
                    />
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {rel.name}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">
                      {rel.followers || "Artist"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
