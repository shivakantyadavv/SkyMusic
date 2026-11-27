import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { spatialAudio } from "../audio/spatialAudio";
import { isTauriEnv } from "../services/http";
import {
  pickLocalAudioFiles,
  refreshLocalRegistration,
} from "../services/localAudio";
import { resolveYoutubeVideoIds } from "../services/youtubeResolver";
import {
  AtmosPreset,
  AudioQualityInfo,
  DownloadedTrackResult,
  DownloadProgressPayload,
  Playlist,
  RepeatMode,
  Track,
} from "../types/music";
import { getTrackBadgeQuality, StreamSourceKind } from "../utils/audioQuality";
import { isTvMode } from "../utils/tvNavigation";

type ActiveBackend = "youtube" | "html5" | null;

interface YtPlaybackStreamResult {
  videoId: string;
  streamUrl: string;
  mimeType: string;
  bitrateKbps: number;
  sampleRateHz: number;
}

interface PlayerContextValue {
  // Playback
  currentTrack: Track | null;
  currentTrackQuality: AudioQualityInfo | null;
  activeStreamKind: StreamSourceKind;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  audioError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;

  // Dolby Atmos / Spatial Audio
  atmosPreset: AtmosPreset;
  setAtmosPreset: (preset: AtmosPreset) => void;
  toggleAtmos: () => void;

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

  // Recently Played
  recentlyPlayed: Track[];
  clearRecentlyPlayed: () => void;

  // Downloads
  downloadedTracks: Track[];
  downloadTrack: (track: Track) => Promise<void>;
  removeDownloadedTrack: (trackId: string) => void;
  isTrackDownloaded: (track: Track) => boolean;
  getDownloadProgress: (trackId: string) => DownloadProgressPayload | null;

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
const RECENTLY_PLAYED_KEY = "skymusic_recently_played";
const ATMOS_PRESET_KEY = "skymusic_atmos_preset";
const DOWNLOADED_TRACKS_KEY = "skymusic_downloaded_tracks";

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
  const activeStreamKindRef = useRef<StreamSourceKind>(null);
  const playRequestIdRef = useRef(0);
  const ytCandidatesRef = useRef<string[]>([]);
  const ytCandidateIndexRef = useRef(0);

  const [bridgePort, setBridgePort] = useState<number>(0);
  const bridgePortRef = useRef<number>(0);
  const [ytBridgeUrl, setYtBridgeUrl] = useState<string | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [activeStreamKind, setActiveStreamKind] =
    useState<StreamSourceKind>(null);
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

  const [atmosPreset, setAtmosPresetState] = useState<AtmosPreset>(() => {
    const saved = readJson<string>(ATMOS_PRESET_KEY, "off");
    return saved === "music" ||
      saved === "movie" ||
      saved === "bass" ||
      saved === "off"
      ? saved
      : "off";
  });
  const lastActiveAtmosRef = useRef<Exclude<AtmosPreset, "off">>(
    atmosPreset !== "off" ? atmosPreset : "music"
  );

  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>(() =>
    readJson<Track[]>(RECENTLY_PLAYED_KEY, [])
  );
  const [isQueueOpen, setQueueOpen] = useState(false);
  const [isNowPlayingOpen, setNowPlayingOpen] = useState(false);

  const [likedTracks, setLikedTracks] = useState<Track[]>(() =>
    readJson<Track[]>(LIKED_KEY, [])
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    readJson<Playlist[]>(PLAYLISTS_KEY, [])
  );
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>(() =>
    readJson<Track[]>(DOWNLOADED_TRACKS_KEY, [])
  );
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<string, DownloadProgressPayload>
  >({});

  // Refs synced with latest state for event handlers
  const currentTrackRef = useRef<Track | null>(null);
  const repeatRef = useRef<RepeatMode>(repeat);
  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);
  const atmosPresetRef = useRef<AtmosPreset>(atmosPreset);
  const downloadedTracksRef = useRef<Track[]>(downloadedTracks);

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

  useEffect(() => {
    atmosPresetRef.current = atmosPreset;
    if (atmosPreset !== "off") {
      lastActiveAtmosRef.current = atmosPreset;
    }
    localStorage.setItem(ATMOS_PRESET_KEY, JSON.stringify(atmosPreset));
    spatialAudio.applyPreset(atmosPreset);
  }, [atmosPreset]);

  useEffect(() => {
    downloadedTracksRef.current = downloadedTracks;
    localStorage.setItem(
      DOWNLOADED_TRACKS_KEY,
      JSON.stringify(downloadedTracks)
    );
  }, [downloadedTracks]);

  // Persist library & recently played
  useEffect(() => {
    localStorage.setItem(LIKED_KEY, JSON.stringify(likedTracks));
  }, [likedTracks]);

  useEffect(() => {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(recentlyPlayed));
  }, [recentlyPlayed]);

  // Resolve local HTTP bridge port + rehydrate downloaded files cleanly
  useEffect(() => {
    if (isTauriEnv()) {
      invoke<number>("get_yt_bridge_port")
        .then(async (port) => {
          setBridgePort(port);
          bridgePortRef.current = port;
          if (port > 0) {
            setYtBridgeUrl(`http://localhost:${port}/yt-player.html`);
          } else {
            setYtBridgeUrl("/yt-player.html");
          }

          // Re-register persisted downloaded files on the active bridge port
          const savedDl = readJson<Track[]>(DOWNLOADED_TRACKS_KEY, []);
          if (savedDl.length > 0) {
            const refreshed = await Promise.all(
              savedDl.map((t) => refreshLocalRegistration(t))
            );
            const valid = refreshed.filter((t): t is Track => t !== null);
            setDownloadedTracks(valid);
          }
        })
        .catch(() => {
          setYtBridgeUrl("/yt-player.html");
        });
    } else {
      setYtBridgeUrl("/yt-player.html");
    }
  }, []);

  // Listen to Rust download progress events
  useEffect(() => {
    if (!isTauriEnv()) return;
    let unlisten: UnlistenFn | null = null;
    listen<DownloadProgressPayload>("track-download-progress", (ev) => {
      const payload = ev.payload;
      setDownloadProgressMap((prev) => ({
        ...prev,
        [payload.trackId]: payload,
      }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const setAtmosPreset = useCallback((preset: AtmosPreset) => {
    spatialAudio.resume();
    setAtmosPresetState(preset);
  }, []);

  const toggleAtmos = useCallback(() => {
    spatialAudio.resume();
    setAtmosPresetState((prev) =>
      prev === "off" ? lastActiveAtmosRef.current || "music" : "off"
    );
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

  // Initialize HTML5 Audio element & connect CORS-safe Web Audio Spatial DSP
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    if (isTauriEnv()) {
      try {
        spatialAudio.attach(audio);
        spatialAudio.applyPreset(atmosPresetRef.current);
      } catch {
        // Fallback gracefully if WebAudio init is deferred
      }
    }

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

  const recordRecentlyPlayed = useCallback((track: Track) => {
    setRecentlyPlayed((prev) =>
      [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 20)
    );
  }, []);

  const clearRecentlyPlayed = useCallback(() => {
    setRecentlyPlayed([]);
  }, []);

  const loadYoutubeVideoId = useCallback(
    (videoId: string) => {
      stopHtml5Audio();
      activeBackendRef.current = "youtube";
      activeStreamKindRef.current = "youtube-iframe";
      setActiveStreamKind("youtube-iframe");
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

  const playHtml5Url = useCallback(
    async (
      url: string | null,
      kind: StreamSourceKind,
      reqId: number
    ): Promise<boolean> => {
      const audio = audioRef.current;
      if (!audio || reqId !== playRequestIdRef.current) return false;

      stopYoutubeAudio();

      if (!url) {
        activeBackendRef.current = null;
        activeStreamKindRef.current = null;
        setActiveStreamKind(null);
        setIsLoadingAudio(false);
        setIsPlaying(false);
        setAudioError("Could not load audio stream for this track.");
        return false;
      }

      // Proxy HTTPS preview URLs through loopback HTTP when inside Tauri so WebAudio DSP never hits CORS silence
      let resolvedUrl = url;
      const port = bridgePortRef.current;
      if (
        isTauriEnv() &&
        port > 0 &&
        url.startsWith("https://") &&
        !url.startsWith(`http://127.0.0.1:${port}`)
      ) {
        resolvedUrl = `http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(
          url
        )}`;
      }

      const isCorsSafe =
        !resolvedUrl.startsWith("http") ||
        resolvedUrl.includes("127.0.0.1") ||
        resolvedUrl.includes("localhost") ||
        resolvedUrl.startsWith(window.location.origin);

      if (isCorsSafe) {
        audio.crossOrigin = "anonymous";
        try {
          spatialAudio.attach(audio);
          spatialAudio.applyPreset(atmosPresetRef.current);
          await spatialAudio.resume();
        } catch {
          // Non-fatal
        }
      }

      activeBackendRef.current = "html5";
      activeStreamKindRef.current = kind;
      setActiveStreamKind(kind);

      try {
        audio.src = resolvedUrl;
        audio.volume = isMutedRef.current ? 0 : volumeRef.current;
        await audio.play();
        if (reqId === playRequestIdRef.current) {
          setIsPlaying(true);
          setIsLoadingAudio(false);
          setAudioError(null);
        }
        return true;
      } catch (err) {
        if (reqId === playRequestIdRef.current) {
          if (kind === "yt-stream" && ytCandidatesRef.current.length > 0) {
            // Fall back cleanly to YouTube IFrame Bridge if direct stream failed to play
            loadYoutubeVideoId(ytCandidatesRef.current[0]);
            return true;
          }
          setIsPlaying(false);
          setIsLoadingAudio(false);
          setAudioError(
            err instanceof Error ? err.message : "Failed to play audio."
          );
        }
        return false;
      }
    },
    [loadYoutubeVideoId, stopYoutubeAudio]
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
      recordRecentlyPlayed(track);

      // Stop whichever source was previously active
      stopHtml5Audio();
      stopYoutubeAudio();
      ytCandidatesRef.current = [];
      ytCandidateIndexRef.current = 0;

      // Local files play directly via loopback /local HTTP stream with WebAudio Atmos DSP
      if (track.source === "local") {
        const refreshed = track.localPath
          ? (await refreshLocalRegistration(track)) || track
          : track;
        if (reqId !== playRequestIdRef.current) return;
        await playHtml5Url(refreshed.streamUrl, "local", reqId);
        return;
      }

      // Check if an offline downloaded HQ version is saved
      const offlineHit =
        track.source === "downloaded"
          ? track
          : downloadedTracksRef.current.find(
              (d) =>
                d.id === track.id ||
                (d.title.toLowerCase() === track.title.toLowerCase() &&
                  d.artist.toLowerCase() === track.artist.toLowerCase())
            );

      if (offlineHit && offlineHit.localPath) {
        const refreshed =
          (await refreshLocalRegistration(offlineHit)) || offlineHit;
        if (reqId !== playRequestIdRef.current) return;
        setCurrentTrack({
          ...track,
          ...refreshed,
          quality: refreshed.quality,
        });
        await playHtml5Url(refreshed.streamUrl, "downloaded", reqId);
        return;
      }

      // Online tracks: resolve YouTube video IDs
      const candidates = await resolveYoutubeVideoIds(track.title, track.artist);
      if (reqId !== playRequestIdRef.current) return;

      if (candidates.length > 0) {
        ytCandidatesRef.current = candidates;
        ytCandidateIndexRef.current = 0;

        // First try direct loopback /stream proxy so Dolby Atmos Spatial WebAudio DSP processes online music!
        if (isTauriEnv()) {
          try {
            const direct = await invoke<YtPlaybackStreamResult | null>(
              "resolve_yt_playback_url",
              { videoIds: candidates }
            );
            if (reqId !== playRequestIdRef.current) return;
            if (direct?.streamUrl) {
              const ok = await playHtml5Url(direct.streamUrl, "yt-stream", reqId);
              if (ok) return;
            }
          } catch {
            // Fall through cleanly to YouTube IFrame Bridge
          }
        }

        if (reqId !== playRequestIdRef.current) return;
        loadYoutubeVideoId(candidates[0]);
      } else {
        // Fallback to Deezer/iTunes preview URL via /proxy
        await playHtml5Url(track.streamUrl, "preview", reqId);
      }
    },
    [
      loadYoutubeVideoId,
      playHtml5Url,
      recordRecentlyPlayed,
      stopHtml5Audio,
      stopYoutubeAudio,
    ]
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
          setIsPlaying(true);
          setIsLoadingAudio(false);
          setAudioError(null);
        } else if (state === 2) {
          setIsPlaying(false);
          setIsLoadingAudio(false);
        } else if (state === 3) {
          setIsLoadingAudio(true);
        } else if (state === 0) {
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
          playHtml5Url(
            currentTrackRef.current.streamUrl,
            "preview",
            playRequestIdRef.current
          );
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadYoutubeVideoId, playHtml5Url, postToYtBridge]);

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
      if (activeBackendRef.current === "html5") {
        setIsPlaying(true);
        setIsLoadingAudio(false);
      }
    };
    const onPause = () => {
      if (activeBackendRef.current === "html5") setIsPlaying(false);
    };
    const onWaiting = () => {
      if (activeBackendRef.current === "html5") setIsLoadingAudio(true);
    };
    const onCanPlay = () => {
      if (activeBackendRef.current === "html5") setIsLoadingAudio(false);
    };
    const onError = () => {
      if (activeBackendRef.current !== "html5") return;
      if (
        activeStreamKindRef.current === "yt-stream" &&
        ytCandidatesRef.current.length > 0
      ) {
        loadYoutubeVideoId(ytCandidatesRef.current[0]);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
  }, [loadYoutubeVideoId]);

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
    spatialAudio.resume();
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

  // Offline HQ Downloader
  const isTrackDownloaded = useCallback(
    (track: Track) =>
      track.source === "downloaded" ||
      downloadedTracks.some(
        (d) =>
          d.id === track.id ||
          (d.title.toLowerCase() === track.title.toLowerCase() &&
            d.artist.toLowerCase() === track.artist.toLowerCase())
      ),
    [downloadedTracks]
  );

  const getDownloadProgress = useCallback(
    (trackId: string) => downloadProgressMap[trackId] || null,
    [downloadProgressMap]
  );

  const downloadTrack = useCallback(async (track: Track) => {
    if (!isTauriEnv()) {
      setAudioError(
        "Offline HQ downloads are supported in the Skymusic Windows & Android app."
      );
      return;
    }

    const existing = downloadProgressMap[track.id];
    if (
      existing &&
      (existing.status === "resolving" ||
        existing.status === "downloading" ||
        existing.status === "tagging")
    ) {
      return;
    }

    setDownloadProgressMap((prev) => ({
      ...prev,
      [track.id]: {
        trackId: track.id,
        progress: 2,
        status: "resolving",
      },
    }));

    try {
      const result = await invoke<DownloadedTrackResult>("download_track_hq", {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArt: track.albumArt,
        previewUrl: track.streamUrl,
      });

      // Mirror into public Android Music/Skymusic folder via MediaStore
      try {
        window.SkymusicAndroid?.exportToMusicFolder?.(
          result.filePath,
          result.fileName,
          result.mimeType,
          track.title,
          track.artist,
          track.album
        );
      } catch {
        // Non-Android / already stored in native Music/Skymusic on Desktop
      }

      const offlineTrack: Track = {
        ...track,
        source: "downloaded",
        localPath: result.filePath,
        fileName: result.fileName,
        streamUrl: result.localStreamUrl,
        duration: result.duration > 0 ? result.duration : track.duration,
        downloadedAt: Date.now(),
        quality: result.quality,
      };

      setDownloadedTracks((prev) => [
        offlineTrack,
        ...prev.filter((d) => d.id !== offlineTrack.id),
      ]);

      if (currentTrackRef.current?.id === track.id) {
        setCurrentTrack((prev) =>
          prev
            ? {
                ...prev,
                localPath: result.filePath,
                fileName: result.fileName,
                downloadedAt: offlineTrack.downloadedAt,
                quality: result.quality,
              }
            : prev
        );
      }

      setDownloadProgressMap((prev) => ({
        ...prev,
        [track.id]: {
          trackId: track.id,
          progress: 100,
          status: "completed",
        },
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to download track.";
      setDownloadProgressMap((prev) => ({
        ...prev,
        [track.id]: {
          trackId: track.id,
          progress: 0,
          status: "error",
          error: msg,
        },
      }));
      setAudioError(msg);
    }
  }, [downloadProgressMap]);

  const removeDownloadedTrack = useCallback((trackId: string) => {
    setDownloadedTracks((prev) => prev.filter((t) => t.id !== trackId));
    setDownloadProgressMap((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
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

  const currentTrackQuality = useMemo(() => {
    if (!currentTrack) return null;
    return getTrackBadgeQuality(currentTrack, true, atmosPreset, activeStreamKind);
  }, [activeStreamKind, atmosPreset, currentTrack]);

  // Keep TV display awake while music is playing or Now Playing theater is open
  useEffect(() => {
    if (!isTvMode()) return;
    try {
      window.SkymusicAndroid?.setKeepScreenOn?.(isPlaying || isNowPlayingOpen);
    } catch {
      // Ignore bridge error outside Android
    }
  }, [isNowPlayingOpen, isPlaying]);

  // Sync MediaSession metadata + Android native MediaSession service
  useEffect(() => {
    if ("mediaSession" in navigator) {
      if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album || "Skymusic",
          artwork: currentTrack.albumArt
            ? [
                { src: currentTrack.albumArt, sizes: "512x512", type: "image/jpeg" },
              ]
            : [],
        });
      }
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
    try {
      if (currentTrack) {
        window.SkymusicAndroid?.updateMediaSession?.(
          currentTrack.title,
          currentTrack.artist,
          currentTrack.album || "Skymusic",
          currentTrack.albumArt || "",
          isPlaying,
          Math.max(0, Math.round(currentTime * 1000)),
          Math.max(0, Math.round((duration || currentTrack.duration || 0) * 1000))
        );
      } else {
        window.SkymusicAndroid?.clearMediaSession?.();
      }
    } catch {
      // Ignore bridge error outside Android
    }
  }, [currentTrack, duration, isPlaying]);

  useEffect(() => {
    const togglePlayIfMatch = (targetState?: "play" | "pause") => {
      if (!currentTrackRef.current) return;
      if (targetState === "play" && isPlaying) return;
      if (targetState === "pause" && !isPlaying) return;
      togglePlay();
    };

    const onMediaKey = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail;
      if (cmd && cmd.startsWith("seek:")) {
        const sec = Number(cmd.slice(5));
        if (Number.isFinite(sec)) seekTo(Math.max(0, sec));
        return;
      }
      switch (cmd) {
        case "play_pause":
          togglePlayIfMatch();
          break;
        case "play":
          togglePlayIfMatch("play");
          break;
        case "pause":
        case "stop":
          togglePlayIfMatch("pause");
          break;
        case "next":
          playNext();
          break;
        case "prev":
          playPrev();
          break;
        case "ff":
          seekTo(Math.min(duration || 0, currentTime + 10));
          break;
        case "rw":
          seekTo(Math.max(0, currentTime - 10));
          break;
      }
    };

    window.addEventListener("skymusic-media-key", onMediaKey);

    if ("mediaSession" in navigator) {
      const safeSet = (
        action: MediaSessionAction,
        handler: MediaSessionActionHandler | null
      ) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {
          // Ignore unsupported MediaSession action
        }
      };
      safeSet("play", () => togglePlayIfMatch("play"));
      safeSet("pause", () => togglePlayIfMatch("pause"));
      safeSet("nexttrack", () => playNext());
      safeSet("previoustrack", () => playPrev());
      safeSet("seekto", (d) => {
        if (typeof d.seekTime === "number") seekTo(d.seekTime);
      });
    }

    return () => {
      window.removeEventListener("skymusic-media-key", onMediaKey);
    };
  }, [currentTime, duration, isPlaying, playNext, playPrev, seekTo, togglePlay]);

  // Keep bridgePort referenced silently in case future callers need it
  void bridgePort;

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        currentTrackQuality,
        activeStreamKind,
        isPlaying,
        isLoadingAudio,
        audioError,
        currentTime,
        duration,
        volume,
        isMuted,
        shuffle,
        repeat,
        atmosPreset,
        setAtmosPreset,
        toggleAtmos,
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
        recentlyPlayed,
        clearRecentlyPlayed,
        downloadedTracks,
        downloadTrack,
        removeDownloadedTrack,
        isTrackDownloaded,
        getDownloadProgress,
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

      {/* Hidden 1x1 YouTube IFrame Audio Bridge (fallback when needed) */}
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
