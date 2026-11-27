import { invoke } from "@tauri-apps/api/core";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isTauriEnv } from "../services/http";
import { pickLocalAudioFiles } from "../services/localAudio";
import { resolveYoutubeVideoIds } from "../services/youtubeResolver";
import { Playlist, RepeatMode, Track } from "../types/music";

type ActiveBackend = "youtube" | "html5" | null;

interface PlayerContextValue {
  // Playback
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  audioError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;

  // Queue & Overlay Actions
  queue: Track[];
  isQueueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  isNowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  playTrack: (track: Track, contextList?: Track[]) => Promise<void>;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;

  // Library
  likedTracks: Track[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  playlists: Playlist[];
  createPlaylist: (name: string, description?: string) => Playlist;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  localTracks: Track[];
  importLocalTracks: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const LIKED_KEY = "skymusic_liked_tracks";
const PLAYLISTS_KEY = "skymusic_playlists";
const VOLUME_KEY = "skymusic_volume";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytFrameRef = useRef<HTMLIFrameElement | null>(null);
  const ytReadyRef = useRef(false);
  const ytPendingLoadRef = useRef<string | null>(null);

  const activeBackendRef = useRef<ActiveBackend>(null);
  const playRequestIdRef = useRef(0);
  const ytCandidatesRef = useRef<string[]>([]);
  const ytCandidateIndexRef = useRef(0);

  const [ytBridgeUrl, setYtBridgeUrl] = useState<string | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(() =>
    readJson<number>(VOLUME_KEY, 0.8)
  );
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [isQueueOpen, setQueueOpen] = useState(false);
  const [isNowPlayingOpen, setNowPlayingOpen] = useState(false);

  const [likedTracks, setLikedTracks] = useState<Track[]>(() =>
    readJson<Track[]>(LIKED_KEY, [])
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    readJson<Playlist[]>(PLAYLISTS_KEY, [])
  );
  const [localTracks, setLocalTracks] = useState<Track[]>([]);

  // Refs synced with latest state for event handlers
  const currentTrackRef = useRef<Track | null>(null);
  const repeatRef = useRef<RepeatMode>(repeat);
  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
  }, [volume, isMuted]);

  // Persist library
  useEffect(() => {
    localStorage.setItem(LIKED_KEY, JSON.stringify(likedTracks));
  }, [likedTracks]);

  useEffect(() => {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  }, [playlists]);

  // Resolve YouTube bridge iframe URL
  useEffect(() => {
    if (isTauriEnv()) {
      invoke<number>("get_yt_bridge_port")
        .then((port) => {
          if (port > 0) {
            setYtBridgeUrl(`http://localhost:${port}/yt-player.html`);
          } else {
            setYtBridgeUrl("/yt-player.html");
          }
        })
        .catch(() => {
          setYtBridgeUrl("/yt-player.html");
        });
    } else {
      setYtBridgeUrl("/yt-player.html");
    }
  }, []);

  const postToYtBridge = useCallback((payload: Record<string, unknown>) => {
    const win = ytFrameRef.current?.contentWindow;
    if (win) {
      win.postMessage(payload, "*");
    }
  }, []);

  const stopHtml5Audio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const stopYoutubeAudio = useCallback(() => {
    ytPendingLoadRef.current = null;
    postToYtBridge({ type: "yt:stop" });
  }, [postToYtBridge]);

  // Initialize HTML5 Audio element (for local files + preview fallback)
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Sync volume & mute to both engines
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    postToYtBridge({
      type: "yt:volume",
      volume: Math.round(volume * 100),
      muted: isMuted,
    });
  }, [volume, isMuted, postToYtBridge]);

  const playHtml5Fallback = useCallback(
    async (track: Track, reqId: number) => {
      const audio = audioRef.current;
      if (!audio || reqId !== playRequestIdRef.current) return;

      stopYoutubeAudio();

      if (!track.streamUrl) {
        activeBackendRef.current = null;
        setIsLoadingAudio(false);
        setIsPlaying(false);
        setAudioError("Could not load audio stream for this track.");
        return;
      }

      activeBackendRef.current = "html5";
      try {
        audio.src = track.streamUrl;
        audio.volume = isMutedRef.current ? 0 : volumeRef.current;
        await audio.play();
        if (reqId === playRequestIdRef.current) {
          setIsPlaying(true);
          setIsLoadingAudio(false);
          setAudioError(null);
        }
      } catch (err) {
        if (reqId === playRequestIdRef.current) {
          setIsPlaying(false);
          setIsLoadingAudio(false);
          setAudioError(
            err instanceof Error ? err.message : "Failed to play audio."
          );
        }
      }
    },
    [stopYoutubeAudio]
  );

  const loadYoutubeVideoId = useCallback(
    (videoId: string) => {
      stopHtml5Audio();
      activeBackendRef.current = "youtube";
      if (!ytReadyRef.current) {
        ytPendingLoadRef.current = videoId;
        return;
      }
      postToYtBridge({
        type: "yt:load",
        videoId,
        volume: Math.round(volumeRef.current * 100),
        muted: isMutedRef.current,
      });
    },
    [postToYtBridge, stopHtml5Audio]
  );

  const playTrackInternal = useCallback(
    async (track: Track) => {
      const reqId = ++playRequestIdRef.current;

      setAudioError(null);
      setIsLoadingAudio(true);
      setIsPlaying(false);
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(track.duration || 0);

      // Stop whichever source was previously active
      stopHtml5Audio();
      stopYoutubeAudio();
      ytCandidatesRef.current = [];
      ytCandidateIndexRef.current = 0;

      // Local audio files play directly via HTML5 Audio
      if (track.source === "local") {
        await playHtml5Fallback(track, reqId);
        return;
      }

      // Online tracks: resolve full-length YouTube video IDs first
      const candidates = await resolveYoutubeVideoIds(
        track.title,
        track.artist
      );
      if (reqId !== playRequestIdRef.current) return;

      if (candidates.length > 0) {
        ytCandidatesRef.current = candidates;
        ytCandidateIndexRef.current = 0;
        loadYoutubeVideoId(candidates[0]);
      } else {
        // Fallback to Deezer/iTunes preview URL if no YouTube candidates found
        await playHtml5Fallback(track, reqId);
      }
    },
    [loadYoutubeVideoId, playHtml5Fallback, stopHtml5Audio, stopYoutubeAudio]
  );

  const playTrack = useCallback(
    async (track: Track, contextList?: Track[]) => {
      if (currentTrackRef.current) {
        setHistory((prev) => [...prev.slice(-29), currentTrackRef.current!]);
      }
      if (contextList && contextList.length > 0) {
        const idx = contextList.findIndex((t) => t.id === track.id);
        const remaining =
          idx >= 0
            ? contextList.slice(idx + 1)
            : contextList.filter((t) => t.id !== track.id);
        setQueue(remaining);
      }
      await playTrackInternal(track);
    },
    [playTrackInternal]
  );

  const playNext = useCallback(() => {
    if (repeat === "one" && currentTrack) {
      if (activeBackendRef.current === "youtube") {
        postToYtBridge({ type: "yt:seek", seconds: 0 });
        postToYtBridge({ type: "yt:play" });
        setCurrentTime(0);
        setIsPlaying(true);
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
        setCurrentTime(0);
        setIsPlaying(true);
      }
      return;
    }

    if (queue.length === 0) {
      if (repeat === "all" && history.length > 0) {
        const all = currentTrack ? [...history, currentTrack] : [...history];
        const first = all[0];
        setQueue(all.slice(1));
        setHistory([]);
        playTrackInternal(first);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    let nextIndex = 0;
    if (shuffle && queue.length > 1) {
      nextIndex = Math.floor(Math.random() * queue.length);
    }

    const nextTrack = queue[nextIndex];
    const nextQueue = queue.filter((_, i) => i !== nextIndex);
    if (currentTrack) {
      setHistory((prev) => [...prev.slice(-29), currentTrack]);
    }
    setQueue(nextQueue);
    playTrackInternal(nextTrack);
  }, [
    currentTrack,
    history,
    playTrackInternal,
    postToYtBridge,
    queue,
    repeat,
    shuffle,
  ]);

  const playNextRef = useRef(playNext);
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrev = useCallback(() => {
    if (currentTime > 3) {
      if (activeBackendRef.current === "youtube") {
        postToYtBridge({ type: "yt:seek", seconds: 0 });
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
      return;
    }
    if (history.length === 0) {
      if (activeBackendRef.current === "youtube") {
        postToYtBridge({ type: "yt:seek", seconds: 0 });
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
      return;
    }
    const prevTrack = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    if (currentTrack) {
      setQueue((prev) => [currentTrack, ...prev]);
    }
    playTrackInternal(prevTrack);
  }, [currentTime, currentTrack, history, playTrackInternal, postToYtBridge]);

  // Listen to YouTube IFrame Bridge postMessage events
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
        return;
      }

      if (msg.type === "yt:ready") {
        ytReadyRef.current = true;
        postToYtBridge({
          type: "yt:volume",
          volume: Math.round(volumeRef.current * 100),
          muted: isMutedRef.current,
        });
        if (ytPendingLoadRef.current) {
          const pendingId = ytPendingLoadRef.current;
          ytPendingLoadRef.current = null;
          loadYoutubeVideoId(pendingId);
        }
        return;
      }

      if (activeBackendRef.current !== "youtube") return;

      if (msg.type === "yt:time") {
        if (typeof msg.currentTime === "number") {
          setCurrentTime(msg.currentTime);
        }
        if (typeof msg.duration === "number" && msg.duration > 0) {
          setDuration(msg.duration);
        }
        return;
      }

      if (msg.type === "yt:state") {
        const state = msg.state;
        if (typeof msg.duration === "number" && msg.duration > 0) {
          setDuration(msg.duration);
        }
        if (typeof msg.currentTime === "number") {
          setCurrentTime(msg.currentTime);
        }

        if (state === 1) {
          // PLAYING
          setIsPlaying(true);
          setIsLoadingAudio(false);
          setAudioError(null);
        } else if (state === 2) {
          // PAUSED
          setIsPlaying(false);
          setIsLoadingAudio(false);
        } else if (state === 3) {
          // BUFFERING
          setIsLoadingAudio(true);
        } else if (state === 0) {
          // ENDED
          setIsLoadingAudio(false);
          playNextRef.current();
        }
        return;
      }

      if (msg.type === "yt:error") {
        const nextIdx = ytCandidateIndexRef.current + 1;
        if (nextIdx < ytCandidatesRef.current.length) {
          ytCandidateIndexRef.current = nextIdx;
          loadYoutubeVideoId(ytCandidatesRef.current[nextIdx]);
        } else if (currentTrackRef.current) {
          playHtml5Fallback(currentTrackRef.current, playRequestIdRef.current);
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadYoutubeVideoId, playHtml5Fallback, postToYtBridge]);

  // Bind HTML5 audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (activeBackendRef.current === "html5") {
        setCurrentTime(audio.currentTime || 0);
      }
    };
    const onDurationChange = () => {
      if (
        activeBackendRef.current === "html5" &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      if (activeBackendRef.current === "html5") {
        playNextRef.current();
      }
    };
    const onPlay = () => {
      if (activeBackendRef.current === "html5") setIsPlaying(true);
    };
    const onPause = () => {
      if (activeBackendRef.current === "html5") setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    if (activeBackendRef.current === "youtube") {
      if (isPlaying) {
        postToYtBridge({ type: "yt:pause" });
        setIsPlaying(false);
      } else {
        postToYtBridge({ type: "yt:play" });
        setIsPlaying(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [currentTrack, isPlaying, postToYtBridge]);

  const seekTo = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      if (activeBackendRef.current === "youtube") {
        postToYtBridge({ type: "yt:seek", seconds });
      } else if (audioRef.current) {
        audioRef.current.currentTime = seconds;
      }
    },
    [postToYtBridge]
  );

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    setIsMuted(clamped === 0);
    localStorage.setItem(VOLUME_KEY, JSON.stringify(clamped));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) =>
      prev === "off" ? "all" : prev === "all" ? "one" : "off"
    );
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const isLiked = useCallback(
    (trackId: string) => likedTracks.some((t) => t.id === trackId),
    [likedTracks]
  );

  const toggleLike = useCallback((track: Track) => {
    setLikedTracks((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      return exists ? prev.filter((t) => t.id !== track.id) : [track, ...prev];
    });
  }, []);

  const createPlaylist = useCallback((name: string, description?: string) => {
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: name.trim() || "Untitled Playlist",
      description: description?.trim() || "Custom Skymusic playlist",
      tracks: [],
      createdAt: Date.now(),
    };
    setPlaylists((prev) => [newPl, ...prev]);
    return newPl;
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.id === track.id)) return pl;
        return {
          ...pl,
          coverImage: pl.coverImage || track.albumArt,
          tracks: [...pl.tracks, track],
        };
      })
    );
  }, []);

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === playlistId
            ? { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) }
            : pl
        )
      );
    },
    []
  );

  const deletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
  }, []);

  const importLocalTracks = useCallback(async () => {
    const picked = await pickLocalAudioFiles();
    if (picked.length > 0) {
      setLocalTracks((prev) => [...picked, ...prev]);
    }
  }, []);

  return (
    <PlayerContext.Provider
      value={{
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
        isNowPlayingOpen,
        setNowPlayingOpen,
        playTrack,
        togglePlay,
        playNext,
        playPrev,
        seekTo,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
        addToQueue,
        removeFromQueue,
        clearQueue,
        likedTracks,
        toggleLike,
        isLiked,
        playlists,
        createPlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        deletePlaylist,
        localTracks,
        importLocalTracks,
      }}
    >
      {children}

      {/* Hidden 1x1 YouTube IFrame Audio Bridge */}
      {ytBridgeUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-0 right-0 -z-10 h-px w-px overflow-hidden opacity-0"
        >
          <iframe
            ref={ytFrameRef}
            src={ytBridgeUrl}
            title="Skymusic Audio Player"
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[240px] w-[240px] border-0"
          />
        </div>
      )}
    </PlayerContext.Provider>
  );
};

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
