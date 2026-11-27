import React, { useState } from "react";
import { Heart, ListPlus, Pause, Play, Plus } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { Track } from "../types/music";
import { formatTime } from "../utils/formatTime";

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

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, contextList);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[#242424] ${
        isCurrent ? "bg-[#242424]/80" : ""
      }`}
    >
      {/* Index / Play button */}
      <button
        onClick={handlePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm text-zinc-400 hover:text-white"
        aria-label={isCurrent && isPlaying ? "Pause" : "Play"}
      >
        {isCurrent && isPlaying ? (
          <Pause className="h-4 w-4 text-[#0EA5E9]" />
        ) : (
          <>
            <span className="group-hover:hidden">{index + 1}</span>
            <Play className="hidden h-4 w-4 fill-current text-white group-hover:block" />
          </>
        )}
      </button>

      {/* Album Art */}
      <img
        src={track.albumArt}
        alt={track.album}
        onClick={handlePlay}
        className="h-11 w-11 shrink-0 cursor-pointer rounded object-cover shadow"
        loading="lazy"
      />

      {/* Title & Artist */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={handlePlay}>
        <p
          className={`truncate text-sm font-medium ${
            isCurrent ? "text-[#0EA5E9]" : "text-white"
          }`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-zinc-400">
          {track.artist}
          <span className="hidden sm:inline"> • {track.album}</span>
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleLike(track)}
          className={`rounded-full p-1.5 transition-colors ${
            liked
              ? "text-[#1DB954]"
              : "text-zinc-400 opacity-70 hover:text-white group-hover:opacity-100"
          }`}
          title={liked ? "Remove from Liked" : "Save to Liked"}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
        </button>

        <button
          onClick={() => addToQueue(track)}
          className="hidden rounded-full p-1.5 text-zinc-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 sm:inline-flex"
          title="Add to Queue"
        >
          <ListPlus className="h-4 w-4" />
        </button>

        {playlists.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="rounded-full p-1.5 text-zinc-400 opacity-70 hover:text-white group-hover:opacity-100"
              title="Add to Playlist"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-8 z-30 w-44 rounded-lg border border-white/10 bg-[#1E1E1E] py-1 shadow-xl"
                onMouseLeave={() => setShowMenu(false)}
              >
                <p className="px-3 py-1 text-[11px] font-semibold uppercase text-zinc-400">
                  Add to Playlist
                </p>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      addTrackToPlaylist(pl.id, track);
                      setShowMenu(false);
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <span className="w-10 text-right text-xs tabular-nums text-zinc-400">
          {formatTime(track.duration)}
        </span>
      </div>
    </div>
  );
};
