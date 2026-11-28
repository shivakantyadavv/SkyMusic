import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ChevronDown,
  Heart,
  ListMusic,
  Loader2,
  MonitorSmartphone,
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
import { useNavigation } from "../context/NavigationContext";
import { usePlayer } from "../context/PlayerContext";
import { useSync } from "../context/SyncContext";
import { fetchLyrics, LyricsResult } from "../services/lyricsApi";
import { formatTime } from "../utils/formatTime";
import { focusPrimaryInScope, useTvMode } from "../utils/tvNavigation";
import {
  AtmosToggleButton,
  DownloadTrackButton,
  QualityBadge,
} from "./AudioControlsBadges";

export const NowPlayingModal: React.FC = () => {
  const {
    currentTrack,
    currentTrackQuality,
    toggleAtmos,
    isPlaying,
    isLoadingAudio,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isNowPlayingOpen,
    setNowPlayingOpen,
    setQueueOpen,
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

  const { openArtist } = useNavigation();
  const { openConnectModal, activeCastTarget, lanPeers, cloudDevices } = useSync();
  const onlineCount = new Set([
    ...lanPeers.map((p) => p.deviceId),
    ...cloudDevices.map((d) => d.deviceId),
  ]).size;
  const tvMode = useTvMode();

  const handleOpenCurrentArtist = () => {
    if (!currentTrack) return;
    const primaryName = currentTrack.artist.split(/[,&]/)[0].trim() || currentTrack.artist;
    setNowPlayingOpen(false);
    openArtist({
      id: currentTrack.artistId
        ? `${currentTrack.source === "itunes" ? "it" : "dz"}-art-${currentTrack.artistId}`
        : `trk-art-${primaryName}`,
      name: primaryName,
      deezerId: currentTrack.source === "deezer" ? currentTrack.artistId : undefined,
      itunesId: currentTrack.source === "itunes" ? currentTrack.artistId : undefined,
      image: currentTrack.albumArt,
      source: currentTrack.source === "itunes" ? "itunes" : "deezer",
    });
  };
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const open = Boolean(isNowPlayingOpen && currentTrack);

  // Close if no track is loaded
  useEffect(() => {
    if (!currentTrack && isNowPlayingOpen) {
      setNowPlayingOpen(false);
    }
  }, [currentTrack, isNowPlayingOpen, setNowPlayingOpen]);

  // Focus Play/Pause button on TV when Now Playing opens
  useEffect(() => {
    if (open && tvMode) {
      const t = window.setTimeout(() => focusPrimaryInScope("now-playing"), 120);
      return () => window.clearTimeout(t);
    }
  }, [open, tvMode]);

  // Fetch lyrics when track changes or lyrics panel is opened
  useEffect(() => {
    if (!currentTrack || !isNowPlayingOpen || !showLyrics) return;

    let cancelled = false;
    setLoadingLyrics(true);
    fetchLyrics(currentTrack.title, currentTrack.artist)
      .then((res) => {
        if (!cancelled) {
          setLyricsData(res);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLyrics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, isNowPlayingOpen, showLyrics]);

  // Reset lyrics cache state when switching tracks
  useEffect(() => {
    setLyricsData(null);
  }, [currentTrack?.id]);

  // Determine current active synced lyric index
  const activeLineIndex = useMemo(() => {
    if (!lyricsData?.synced || lyricsData.lines.length === 0) return -1;
    let active = -1;
    for (let i = 0; i < lyricsData.lines.length; i++) {
      const t = lyricsData.lines[i].time;
      if (t !== null && t <= currentTime + 0.3) {
        active = i;
      } else {
        break;
      }
    }
    return active;
  }, [lyricsData, currentTime]);

  // Smoothly auto-scroll to the active lyric line
  useEffect(() => {
    if (showLyrics && activeLineIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLineIndex, showLyrics]);

  const progressPct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volPct = (isMuted ? 0 : volume) * 100;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;

  const renderTransportControls = (compact = false) => (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {/* Seek Bar */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.5}
          data-tv-step={10}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Seek track position"
          className="sky-range w-full"
          style={{
            background: `linear-gradient(to right, #0EA5E9 ${progressPct}%, var(--range-track-bg) ${progressPct}%)`,
            height: "5px",
            borderRadius: "9999px",
          }}
        />
        <div className="flex justify-between text-xs tabular-nums text-[var(--text-secondary)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleShuffle}
          className={`rounded-full p-2 transition ${
            shuffle
              ? "text-[#0EA5E9]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title="Shuffle"
        >
          <Shuffle className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-4 md:gap-5">
          <button
            onClick={playPrev}
            className="rounded-full p-2 text-[var(--text-primary)] opacity-85 transition hover:scale-105 hover:opacity-100"
            title="Previous"
          >
            <SkipBack className={compact ? "h-6 w-6 fill-current" : "h-7 w-7 fill-current"} />
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoadingAudio}
            data-tv-autofocus="true"
            className={`flex items-center justify-center rounded-full bg-[var(--play-btn-bg)] text-[var(--play-btn-fg)] shadow-xl transition hover:scale-105 disabled:opacity-50 ${
              compact ? "h-12 w-12" : "h-14 w-14"
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isLoadingAudio ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            )}
          </button>

          <button
            onClick={playNext}
            className="rounded-full p-2 text-[var(--text-primary)] opacity-85 transition hover:scale-105 hover:opacity-100"
            title="Next"
          >
            <SkipForward className={compact ? "h-6 w-6 fill-current" : "h-7 w-7 fill-current"} />
          </button>
        </div>

        <button
          onClick={cycleRepeat}
          className={`rounded-full p-2 transition ${
            repeat !== "off"
              ? "text-[#1DB954]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title={`Repeat: ${repeat}`}
        >
          {repeat === "one" ? (
            <Repeat1 className="h-5 w-5" />
          ) : (
            <Repeat className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Volume Row */}
      <div className="hidden items-center justify-center gap-2 pt-0.5 md:flex">
        <button
          onClick={toggleMute}
          className="rounded-full p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
          data-tv-step={0.05}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Now playing volume"
          className="sky-range w-32"
          style={{
            background: `linear-gradient(to right, #1DB954 ${volPct}%, var(--range-track-bg) ${volPct}%)`,
            height: "4px",
            borderRadius: "9999px",
          }}
        />
      </div>
    </div>
  );

  const renderLyricsPanel = () => (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xl md:p-5"
      style={{
        backgroundColor: "var(--np-lyrics-bg)",
        backdropFilter: "var(--backdrop-blur)",
        WebkitBackdropFilter: "var(--backdrop-blur)",
      }}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">
            Lyrics • {currentTrack?.title}
          </h3>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {currentTrack?.artist}
          </p>
        </div>
        {lyricsData?.synced && (
          <span className="shrink-0 rounded-full bg-[#1DB954]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1DB954]">
            Synced
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {loadingLyrics ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
            <Loader2 className="h-7 w-7 animate-spin text-[#0EA5E9]" />
            <p className="text-xs">Fetching lyrics...</p>
          </div>
        ) : !lyricsData || lyricsData.lines.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Lyrics not available for this track
            </p>
            <p className="max-w-xs text-xs text-[var(--text-secondary)]">
              Enjoy the music! Some regional or newly released tracks do not have
              lyrics indexed yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 py-3">
            {lyricsData.lines.map((line, idx) => {
              const isActive = lyricsData.synced && idx === activeLineIndex;
              const isPast =
                lyricsData.synced &&
                activeLineIndex >= 0 &&
                idx < activeLineIndex;
              return (
                <button
                  key={`${idx}-${line.text.slice(0, 12)}`}
                  ref={isActive ? activeLineRef : undefined}
                  onClick={() => {
                    if (line.time !== null) {
                      seekTo(line.time);
                    }
                  }}
                  disabled={line.time === null}
                  className={`block w-full rounded-lg px-2 py-1 text-left text-lg font-bold leading-relaxed transition-all duration-300 md:text-xl ${
                    line.time !== null
                      ? "cursor-pointer hover:text-[var(--text-primary)]"
                      : "cursor-default"
                  } ${
                    isActive
                      ? "scale-[1.01] text-[var(--text-primary)]"
                      : isPast
                      ? "text-[var(--lyric-past)]"
                      : lyricsData.synced
                      ? "text-[var(--lyric-upcoming)]"
                      : "text-[var(--text-primary)] opacity-85"
                  }`}
                >
                  {line.text}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      data-tv-scope="now-playing"
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
      style={{ visibility: open ? "visible" : "hidden" }}
      className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--bg-app)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* Ambient Blurred Album Background */}
      {currentTrack && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={currentTrack.albumArt}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-25 blur-3xl"
          />
          <div
            className="absolute inset-0"
            style={{ background: "var(--np-overlay)" }}
          />
        </div>
      )}

      {/* Top Header */}
      <header
        className={`relative z-10 flex shrink-0 items-center justify-between ${
          tvMode ? "px-6 py-2.5" : "px-4 py-4 md:px-8"
        }`}
      >
        <button
          onClick={() => setNowPlayingOpen(false)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
          title="Minimize"
          aria-label="Minimize Now Playing"
        >
          <ChevronDown className="h-6 w-6" />
        </button>

        <div className="min-w-0 px-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Now Playing
          </p>
          <p className="truncate text-xs font-medium text-[var(--text-primary)]">
            {currentTrack?.album || "Skymusic"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AtmosToggleButton compact />

          <button
            type="button"
            onClick={() => openConnectModal("devices")}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] transition hover:bg-[var(--bg-subtle-hover)] ${
              activeCastTarget
                ? "bg-[#1DB954]/20 text-[#1DB954]"
                : "bg-[var(--bg-subtle)] text-[var(--text-primary)]"
            }`}
            title="Connect, Sync & Cast to TV"
            aria-label="Connect, Sync & Cast to TV"
          >
            <MonitorSmartphone className="h-4 w-4" />
            {onlineCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#1DB954] px-1 text-[9px] font-bold text-black">
                {onlineCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowLyrics((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
              showLyrics
                ? "bg-[#0EA5E9] text-white shadow-lg shadow-[#0EA5E9]/30"
                : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
            }`}
            title="Toggle Lyrics"
          >
            <AlignLeft className="h-4 w-4" />
            <span>Lyrics</span>
          </button>

          <button
            onClick={() => {
              setNowPlayingOpen(false);
              setQueueOpen(true);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
            title="Open Queue"
            aria-label="Open Queue"
          >
            <ListMusic className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      {currentTrack &&
        (tvMode ? (
          /* Widescreen TV Theater Mode (fits cleanly inside 960x540 TV viewport) */
          <div className="relative z-10 mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-cols-12 items-center gap-7 px-8 pb-5">
            {showLyrics ? (
              <>
                <div className="col-span-5 flex flex-col justify-center gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={currentTrack.albumArt}
                      alt={currentTrack.album}
                      className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-2xl ring-1 ring-[var(--border-subtle)]"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                        {currentTrack.title}
                      </h2>
                      <button
                        type="button"
                        onClick={handleOpenCurrentArtist}
                        className="mt-0.5 block max-w-full truncate rounded px-1 -mx-1 text-left text-sm text-[var(--text-secondary)] hover:text-[#38bdf8] hover:underline"
                        title="Open Artist Profile"
                      >
                        {currentTrack.artist}
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {currentTrackQuality && (
                          <QualityBadge
                            quality={currentTrackQuality}
                            compact
                            interactive
                            onClick={toggleAtmos}
                          />
                        )}
                        <DownloadTrackButton track={currentTrack} size="sm" />
                        <button
                          onClick={() => toggleLike(currentTrack)}
                          className={`rounded-full p-1.5 transition ${
                            liked
                              ? "text-[#1DB954]"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                          title={liked ? "Unlike" : "Like"}
                        >
                          <Heart
                            className={`h-4 w-4 ${liked ? "fill-current" : ""}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                  {renderTransportControls(true)}
                </div>

                <div className="col-span-7 h-full min-h-0 max-h-[calc(100vh-88px)]">
                  {renderLyricsPanel()}
                </div>
              </>
            ) : (
              <>
                <div className="col-span-5 flex items-center justify-center">
                  <div className="aspect-square w-full max-w-[270px] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-[var(--border-subtle)]">
                    <img
                      src={currentTrack.albumArt}
                      alt={currentTrack.album}
                      className={`h-full w-full object-cover transition-transform duration-500 ${
                        isPlaying ? "scale-100" : "scale-95 opacity-90"
                      }`}
                    />
                  </div>
                </div>

                <div className="col-span-7 flex flex-col justify-center space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                        {currentTrack.title}
                      </h2>
                      <button
                        type="button"
                        onClick={handleOpenCurrentArtist}
                        className="mt-1 block max-w-full truncate rounded px-1 -mx-1 text-left text-base text-[var(--text-secondary)] hover:text-[#38bdf8] hover:underline"
                        title="Open Artist Profile"
                      >
                        {currentTrack.artist}
                      </button>
                      {currentTrackQuality && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <QualityBadge
                            quality={currentTrackQuality}
                            interactive
                            onClick={toggleAtmos}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DownloadTrackButton track={currentTrack} size="md" />
                      <button
                        onClick={() => toggleLike(currentTrack)}
                        className={`rounded-full p-2.5 transition ${
                          liked
                            ? "text-[#1DB954]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]"
                        }`}
                        title={liked ? "Unlike" : "Like"}
                      >
                        <Heart
                          className={`h-6 w-6 ${liked ? "fill-current" : ""}`}
                        />
                      </button>
                    </div>
                  </div>
                  {renderTransportControls(false)}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Standard Desktop & Mobile Layout */
          <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-5 pb-6 md:px-10">
            <div
              className={`grid min-h-0 flex-1 items-center gap-6 transition-all duration-300 ${
                showLyrics ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
              }`}
            >
              {/* Left / Center Artwork & Info */}
              <div
                className={`flex flex-col items-center justify-center ${
                  showLyrics ? "hidden lg:flex" : "flex"
                }`}
              >
                <div className="w-full max-w-xs sm:max-w-sm">
                  <div className="aspect-square w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[var(--border-subtle)]">
                    <img
                      src={currentTrack.albumArt}
                      alt={currentTrack.album}
                      className={`h-full w-full object-cover transition-transform duration-500 ${
                        isPlaying ? "scale-100" : "scale-95 opacity-90"
                      }`}
                    />
                  </div>

                  {/* Title, Artist, Quality Pill & Actions */}
                  <div className="mt-6 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-2xl">
                        {currentTrack.title}
                      </h2>
                      <button
                        type="button"
                        onClick={handleOpenCurrentArtist}
                        className="mt-0.5 block max-w-full truncate rounded px-1 -mx-1 text-left text-sm text-[var(--text-secondary)] hover:text-[#38bdf8] hover:underline"
                        title="Open Artist Profile"
                      >
                        {currentTrack.artist}
                      </button>
                      {currentTrackQuality && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <QualityBadge
                            quality={currentTrackQuality}
                            interactive
                            onClick={toggleAtmos}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <DownloadTrackButton track={currentTrack} size="md" />
                      <button
                        onClick={() => toggleLike(currentTrack)}
                        className={`rounded-full p-2.5 transition ${
                          liked
                            ? "text-[#1DB954]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]"
                        }`}
                        title={liked ? "Unlike" : "Like"}
                      >
                        <Heart
                          className={`h-6 w-6 ${liked ? "fill-current" : ""}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right / Full-Screen Lyrics Panel */}
              {showLyrics && renderLyricsPanel()}
            </div>

            {/* Bottom Controls Inside Now Playing */}
            <div className="mx-auto mt-4 w-full max-w-xl shrink-0 space-y-3">
              {showLyrics && (
                <div className="flex items-center justify-between gap-3 lg:hidden">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img
                      src={currentTrack.albumArt}
                      alt={currentTrack.album}
                      className="h-10 w-10 rounded-md object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                        {currentTrack.title}
                      </p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">
                        {currentTrack.artist}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleLike(currentTrack)}
                    className={`p-2 ${
                      liked ? "text-[#1DB954]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <Heart
                      className={`h-5 w-5 ${liked ? "fill-current" : ""}`}
                    />
                  </button>
                </div>
              )}

              {renderTransportControls(false)}
            </div>
          </div>
        ))}
    </div>
  );
};
