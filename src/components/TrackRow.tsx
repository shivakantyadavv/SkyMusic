import React, { useState } from "react";
import { Heart, ListPlus, Pause, Play, Plus } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { Track } from "../types/music";
import { getTrackBadgeQuality } from "../utils/audioQuality";
import { formatTime } from "../utils/formatTime";
import { DownloadTrackButton, QualityBadge } from "./AudioControlsBadges";

interface TrackRowProps {
  track: Track;
  index: number;
  contextList?: Track[];
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  contextList,
}) => {
  const {
    currentTrack,
    currentTrackQuality,
    activeStreamKind,
    atmosPreset,
    isPlaying,
    playTrack,
    togglePlay,
    isLiked,
    toggleLike,
    addToQueue,
    playlists,
    addTrackToPlaylist,
  } = usePlayer();

  const [showMenu, setShowMenu] = useState(false);

  const isCurrent = currentTrack?.id === track.id;
  const liked = isLiked(track.id);
  const badgeQuality =
    isCurrent && currentTrackQuality
      ? currentTrackQuality
      : getTrackBadgeQuality(track, false, atmosPreset, activeStreamKind);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, contextList);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-card-hover)] ${
        isCurrent ? "bg-[var(--bg-card-hover)]" : ""
      }`}
    >
      {/* Unified Primary Play / Title Control for Clean TV D-Pad & Mouse Navigation */}
      <button
        type="button"
        onClick={handlePlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left"
        aria-label={`${isCurrent && isPlaying ? "Pause" : "Play"} ${track.title}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
          {isCurrent && isPlaying ? (
            <Pause className="h-4 w-4 text-[#0EA5E9]" />
          ) : (
            <>
              <span className="group-hover:hidden">{index + 1}</span>
              <Play className="hidden h-4 w-4 fill-current text-[var(--text-primary)] group-hover:block" />
            </>
          )}
        </span>

        <img
          src={track.albumArt}
          alt={track.album}
          className="h-11 w-11 shrink-0 rounded object-cover shadow"
          loading="lazy"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`truncate text-sm font-medium ${
                isCurrent ? "text-[#0EA5E9]" : "text-[var(--text-primary)]"
              }`}
            >
              {track.title}
            </p>
            <QualityBadge quality={badgeQuality} compact />
          </div>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {track.artist}
            <span className="hidden sm:inline"> • {track.album}</span>
          </p>
        </div>
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 pr-1">
        <DownloadTrackButton track={track} size="sm" />

        <button
          onClick={() => toggleLike(track)}
          className={`rounded-full p-1.5 transition-colors ${
            liked
              ? "text-[#1DB954]"
              : "text-[var(--text-secondary)] opacity-70 hover:text-[var(--text-primary)] group-hover:opacity-100"
          }`}
          title={liked ? "Remove from Liked" : "Save to Liked"}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
        </button>

        <button
          onClick={() => addToQueue(track)}
          className="group-focus-reveal hidden rounded-full p-1.5 text-[var(--text-secondary)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-100 sm:inline-flex"
          title="Add to Queue"
        >
          <ListPlus className="h-4 w-4" />
        </button>

        {playlists.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="rounded-full p-1.5 text-[var(--text-secondary)] opacity-70 hover:text-[var(--text-primary)] group-hover:opacity-100"
              title="Add to Playlist"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showMenu && (
              <div
                className="sky-surface-strong absolute right-0 top-8 z-30 w-44 rounded-lg border border-[var(--border-subtle)] py-1 shadow-xl"
                onMouseLeave={() => setShowMenu(false)}
              >
                <p className="px-3 py-1 text-[11px] font-semibold uppercase text-[var(--text-secondary)]">
                  Add to Playlist
                </p>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      addTrackToPlaylist(pl.id, track);
                      setShowMenu(false);
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <span className="w-10 text-right text-xs tabular-nums text-[var(--text-secondary)]">
          {formatTime(track.duration)}
        </span>
      </div>
    </div>
  );
};
