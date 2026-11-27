import React from "react";
import {
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { formatTime } from "../utils/formatTime";

export const PlayerBar: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isLoadingAudio,
    audioError,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    queue,
    isQueueOpen,
    setQueueOpen,
    setNowPlayingOpen,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    isLiked,
    toggleLike,
  } = usePlayer();

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volPct = (isMuted ? 0 : volume) * 100;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;

  return (
    <footer className="shrink-0 border-t border-white/10 bg-[#181818] px-3 py-2.5 md:px-5">
      {audioError && (
        <div className="mb-1.5 rounded bg-red-500/15 px-3 py-1 text-center text-xs text-red-300">
          {audioError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {/* Left: Track Info (Click to open Now Playing) */}
        <div className="flex min-w-0 flex-1 items-center gap-2 md:w-1/4 md:flex-none">
          {currentTrack ? (
            <>
              <div
                onClick={() => setNowPlayingOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setNowPlayingOpen(true);
                  }
                }}
                className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-white/10"
                title="Open Now Playing & Lyrics"
              >
                <div className="relative shrink-0">
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.album}
                    className="h-11 w-11 rounded-md object-cover shadow-md md:h-14 md:w-14"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <ChevronUp className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-[#0EA5E9]">
                    {currentTrack.title}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {currentTrack.artist}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleLike(currentTrack)}
                className={`hidden rounded-full p-1.5 transition-colors sm:inline-flex ${
                  liked
                    ? "text-[#1DB954]"
                    : "text-zinc-400 hover:text-white"
                }`}
                aria-label="Like track"
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#242424] text-zinc-500 md:h-14 md:w-14">
                <ListMusic className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  Nothing playing
                </p>
                <p className="text-xs text-zinc-500">Pick a track to start</p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Controls & Seek Bar */}
        <div className="flex flex-col items-center gap-1.5 md:w-2/4 md:max-w-xl">
          <div className="flex items-center gap-3 md:gap-5">
            <button
              onClick={toggleShuffle}
              className={`hidden rounded-full p-1.5 transition-colors sm:inline-flex ${
                shuffle ? "text-[#0EA5E9]" : "text-zinc-400 hover:text-white"
              }`}
              title="Shuffle"
            >
              <Shuffle className="h-4 w-4" />
            </button>

            <button
              onClick={playPrev}
              disabled={!currentTrack}
              className="rounded-full p-1.5 text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
              title="Previous"
            >
              <SkipBack className="h-5 w-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentTrack || isLoadingAudio}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-md transition-transform hover:scale-105 disabled:opacity-40 md:h-10 md:w-10"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isLoadingAudio ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              )}
            </button>

            <button
              onClick={playNext}
              disabled={!currentTrack}
              className="rounded-full p-1.5 text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
              title="Next"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>

            <button
              onClick={cycleRepeat}
              className={`hidden rounded-full p-1.5 transition-colors sm:inline-flex ${
                repeat !== "off"
                  ? "text-[#1DB954]"
                  : "text-zinc-400 hover:text-white"
              }`}
              title={`Repeat: ${repeat}`}
            >
              {repeat === "one" ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Desktop Seek Bar */}
          <div className="hidden w-full items-center gap-2 md:flex">
            <span className="w-10 text-right text-[11px] tabular-nums text-zinc-400">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.5}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              disabled={!currentTrack}
              className="sky-range flex-1"
              style={{
                background: `linear-gradient(to right, #0EA5E9 ${progressPct}%, #3f3f46 ${progressPct}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
            <span className="w-10 text-[11px] tabular-nums text-zinc-400">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: Queue & Volume */}
        <div className="flex items-center justify-end gap-2 md:w-1/4">
          <button
            onClick={() => setQueueOpen(!isQueueOpen)}
            className={`relative rounded-full p-2 transition-colors ${
              isQueueOpen ? "text-[#0EA5E9]" : "text-zinc-400 hover:text-white"
            }`}
            title="Queue"
          >
            <ListMusic className="h-4 w-4" />
            {queue.length > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#0EA5E9] px-1 text-[9px] font-bold text-white">
                {queue.length}
              </span>
            )}
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={toggleMute}
              className="rounded-full p-1.5 text-zinc-400 hover:text-white"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="sky-range w-24"
              style={{
                background: `linear-gradient(to right, #1DB954 ${volPct}%, #3f3f46 ${volPct}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Mobile Thin Seek Bar */}
      <div className="mt-2 flex items-center gap-2 md:hidden">
        <span className="text-[10px] tabular-nums text-zinc-400">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.5}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!currentTrack}
          className="sky-range flex-1"
          style={{
            background: `linear-gradient(to right, #0EA5E9 ${progressPct}%, #3f3f46 ${progressPct}%)`,
            height: "3px",
            borderRadius: "9999px",
          }}
        />
        <span className="text-[10px] tabular-nums text-zinc-400">
          {formatTime(duration)}
        </span>
      </div>
    </footer>
  );
};
