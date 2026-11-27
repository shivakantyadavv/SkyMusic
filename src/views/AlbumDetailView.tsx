import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Play, Shuffle, User } from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import { fetchAlbumDetail } from "../services/musicApi";
import { AlbumItem, Track } from "../types/music";

interface AlbumDetailViewProps {
  album: AlbumItem;
}

export const AlbumDetailView: React.FC<AlbumDetailViewProps> = ({ album }) => {
  const { goBack, openArtist } = useNavigation();
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAlbumDetail(album)
      .then((res) => {
        if (!cancelled) setTracks(res.tracks);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [album.id]);

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
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

      {/* Spotify Album Hero */}
      <div className="flex flex-col gap-5 rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[#0EA5E9]/30 via-[#161a1f] to-[#8B5CF6]/25 p-6 shadow-xl sm:flex-row sm:items-end">
        <img
          src={album.image}
          alt={album.title}
          className="h-36 w-36 shrink-0 rounded-xl object-cover shadow-2xl sm:h-44 sm:w-44"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
            Album
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            {album.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/85">
            <button
              onClick={() =>
                openArtist({
                  id: `alb-art-${album.artist}`,
                  name: album.artist,
                  image: album.image,
                  source: album.source,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20"
            >
              <User className="h-3.5 w-3.5" />
              {album.artist}
            </button>
            {album.releaseDate && (
              <span className="text-xs text-white/75">
                • {album.releaseDate.slice(0, 4)}
              </span>
            )}
            <span className="text-xs text-white/75">
              • {tracks.length} songs
            </span>
          </div>

          {tracks.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => playTrack(tracks[0], tracks)}
                className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-105 hover:bg-[#1ed760]"
              >
                <Play className="h-4 w-4 fill-current" />
                Play Album
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

      {loading ? (
        <div className="sky-card flex h-48 items-center justify-center rounded-2xl">
          <Loader2 className="h-7 w-7 animate-spin text-[#0EA5E9]" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="sky-card rounded-xl p-8 text-center text-sm text-[var(--text-secondary)]">
          No tracks found in this album.
        </div>
      ) : (
        <div className="sky-card rounded-xl p-2">
          {tracks.map((track, idx) => (
            <TrackRow
              key={`${album.id}-${track.id}-${idx}`}
              track={track}
              index={idx}
              contextList={tracks}
            />
          ))}
        </div>
      )}
    </div>
  );
};
