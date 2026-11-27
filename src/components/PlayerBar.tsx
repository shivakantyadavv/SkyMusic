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

  const progressPct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volPct = (isMuted ? 0 : volume) * 100;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;

  return (
    <footer
      className="sky-surface shrink-0 border-t px-3 py-2.5 md:px-5"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {audioError && (
        <div className="mb-1.5 rounded bg-red-500/15 px-3 py-1 text-center text-xs text-red-400">
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
                className="group -m-1.5 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-card-hover)]"
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
                  <p
                    className="truncate text-sm font-semibold transition-colors group-hover:text-[#0EA5E9]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {currentTrack.title}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {currentTrack.artist}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleLike(currentTrack)}
                className="hidden rounded-full p-1.5 transition-colors hover:opacity-100 sm:inline-flex"
                style={{
                  color: liked ? "var(--accent-green)" : "var(--text-secondary)",
                }}
                aria-label="Like track"
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-md md:h-14 md:w-14"
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <ListMusic className="h-5 w-5" />
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Nothing playing
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Pick a track to start
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Controls & Seek Bar */}
        <div className="flex flex-col items-center gap-1.5 md:w-2/4 md:max-w-xl">
          <div className="flex items-center gap-3 md:gap-5">
            <button
              onClick={toggleShuffle}
              className="hidden rounded-full p-1.5 transition-colors sm:inline-flex"
              style={{
                color: shuffle ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
              title="Shuffle"
            >
              <Shuffle className="h-4 w-4" />
            </button>

            <button
              onClick={playPrev}
              disabled={!currentTrack}
              className="rounded-full p-1.5 transition-colors disabled:opacity-40"
              style={{ color: "var(--text-primary)" }}
              title="Previous"
            >
              <SkipBack className="h-5 w-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentTrack || isLoadingAudio}
              className="flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 disabled:opacity-40 md:h-10 md:w-10"
              style={{
                backgroundColor: "var(--play-btn-bg)",
                color: "var(--play-btn-fg)",
              }}
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
              className="rounded-full p-1.5 transition-colors disabled:opacity-40"
              style={{ color: "var(--text-primary)" }}
              title="Next"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>

            <button
              onClick={cycleRepeat}
              className="hidden rounded-full p-1.5 transition-colors sm:inline-flex"
              style={{
                color:
                  repeat !== "off"
                    ? "var(--accent-green)"
                    : "var(--text-secondary)",
              }}
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
            <span
              className="w-10 text-right text-[11px] tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
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
                background: `linear-gradient(to right, var(--accent-primary) ${progressPct}%, var(--range-track-bg) ${progressPct}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
            <span
              className="w-10 text-[11px] tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: Queue & Volume */}
        <div className="flex items-center justify-end gap-2 md:w-1/4">
          <button
            onClick={() => setQueueOpen(!isQueueOpen)}
            className="relative rounded-full p-2 transition-colors"
            style={{
              color: isQueueOpen
                ? "var(--accent-primary)"
                : "var(--text-secondary)",
            }}
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
              className="rounded-full p-1.5 transition-colors"
              style={{ color: "var(--text-secondary)" }}
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
                background: `linear-gradient(to right, var(--accent-green) ${volPct}%, var(--range-track-bg) ${volPct}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Mobile Thin Seek Bar */}
      <div className="mt-2 flex items-center gap-2 md:hidden">
        <span
          className="text-[10px] tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
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
            background: `linear-gradient(to right, var(--accent-primary) ${progressPct}%, var(--range-track-bg) ${progressPct}%)`,
            height: "3px",
            borderRadius: "9999px",
          }}
        />
        <span
          className="text-[10px] tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {formatTime(duration)}
        </span>
      </div>
    </footer>
  );
};
