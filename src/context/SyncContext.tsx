import { User } from "firebase/auth";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ensureUserSyncRoom,
  generateTvPairCode,
  linkTvWithPairCode,
  publishCloudDevicePresence,
  pushSnapshotToCloudRoom,
  sendCloudCastCommand,
  signInCloudAccount,
  signOutCloudAccount,
  signUpCloudAccount,
  subscribeAuthUser,
  subscribeToSyncRoom,
  ensureCloudAuthForPairing,
} from "../services/cloudSync";
import {
  getLanDevices,
  initLanSync,
  onLanCastCommand,
  onLanPeersUpdated,
  onLanSyncReceived,
  probeLanIp,
  refreshLanDiscovery,
  sendLanCast,
  syncWithLanPeer,
  updateLanSnapshot,
} from "../services/lanSync";
import {
  AtmosPreset,
  LanCastAction,
  LanCastCommand,
  LanDeviceInfo,
  LanNowPlayingSummary,
  SyncContinueListening,
  SyncDevicePresence,
  SyncSnapshot,
  Track,
} from "../types/music";
import { mergeSyncSnapshots } from "../utils/syncMerge";
import { isTvMode } from "../utils/tvNavigation";
import { getCurrentAppVersion } from "../utils/updater";
import { usePlayer } from "./PlayerContext";
import { useTheme } from "./ThemeContext";

export type ConnectTab = "devices" | "cloud";
export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

export interface CastDeviceTarget {
  kind: "lan" | "cloud";
  deviceId: string;
  deviceName: string;
  platform: "desktop" | "tv" | "mobile";
  ip?: string;
  port?: number;
  nowPlaying?: LanNowPlayingSummary | null;
}

export interface TvPairSessionState {
  code: string;
  expiresAt: number;
}

interface SyncContextValue {
  // Device identity & LAN settings
  deviceId: string;
  deviceName: string;
  setDeviceName: (name: string) => void;
  platform: "desktop" | "tv" | "mobile";
  lanPin: string;
  setLanPin: (pin: string) => void;

  // Option 1: Cloud Sync & Auth
  cloudUser: User | null;
  cloudRoomId: string | null;
  cloudLinkedEmail: string | null;
  isCloudConnected: boolean;
  cloudStatus: CloudSyncStatus;
  cloudError: string | null;
  lastCloudSyncAt: number | null;
  cloudDevices: SyncDevicePresence[];
  signInCloud: (email: string, password: string) => Promise<void>;
  signUpCloud: (email: string, password: string, displayName?: string) => Promise<void>;
  quickStartCloud: () => Promise<void>;
  signOutCloud: () => Promise<void>;
  syncCloudNow: () => Promise<void>;

  // Option 1: TV 6-digit Pair Code
  tvPairSession: TvPairSessionState | null;
  pairMessage: string | null;
  startTvPairSession: () => Promise<void>;
  cancelTvPairSession: () => Promise<void>;
  linkTvWithCode: (code: string) => Promise<string>;

  // Option 3: Wi-Fi Direct LAN Discovery & Sync
  lanSelfInfo: LanDeviceInfo | null;
  lanPeers: LanDeviceInfo[];
  lanBusy: boolean;
  lanMessage: string | null;
  refreshLan: () => Promise<void>;
  probeLanAddress: (ip: string, port?: number) => Promise<LanDeviceInfo>;
  syncWithLanDevice: (peer: LanDeviceInfo) => Promise<void>;

  // Cast / Connect Control ("Play on TV / PC")
  activeCastTarget: CastDeviceTarget | null;
  selectCastTarget: (target: CastDeviceTarget | null) => void;
  castCommand: (
    target: CastDeviceTarget,
    action: LanCastAction,
    opts?: {
      track?: Track | null;
      queue?: Track[] | null;
      position?: number;
      volume?: number;
      muted?: boolean;
      atmosPreset?: AtmosPreset;
    }
  ) => Promise<void>;
  handoffPlaybackTo: (
    target: CastDeviceTarget,
    pauseLocal?: boolean
  ) => Promise<void>;

  // Continue Listening across devices
  remoteContinueListening: SyncContinueListening | null;
  resumeContinueListening: () => Promise<void>;
  dismissContinueListening: () => void;

  // Modal controls
  isConnectOpen: boolean;
  connectTab: ConnectTab;
  openConnectModal: (tab?: ConnectTab) => void;
  closeConnectModal: () => void;
}

const DEVICE_ID_KEY = "skymusic_device_id";
const DEVICE_NAME_KEY = "skymusic_device_name";
const LAN_PIN_KEY = "skymusic_lan_pin";
const CLOUD_ROOM_KEY = "skymusic_cloud_room_id";
const CLOUD_EMAIL_KEY = "skymusic_cloud_linked_email";
const CONTINUE_DISMISSED_KEY = "skymusic_continue_dismissed_at";

const SyncContext = createContext<SyncContextValue | null>(null);

function detectPlatformKind(): "desktop" | "tv" | "mobile" {
  if (isTvMode()) return "tv";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/android/i.test(ua) || typeof window.SkymusicAndroid !== "undefined") {
    return "mobile";
  }
  return "desktop";
}

function getOrCreateDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved && saved.trim()) return saved.trim();
    const id = `dev-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now().toString(36)}`;
  }
}

function detectDefaultDeviceName(platform: "desktop" | "tv" | "mobile"): string {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore storage errors
  }

  try {
    const model = window.SkymusicAndroid?.getDeviceModel?.();
    if (model && model.trim()) {
      return platform === "tv" ? `${model.trim()} (TV)` : model.trim();
    }
  } catch {
    // ignore bridge errors
  }

  if (platform === "tv") return "Android TV";
  if (platform === "mobile") return "Android Phone";
  return "Windows PC";
}

function computeSnapshotDigest(snap: SyncSnapshot): string {
  const liked = (snap.likedTracks || []).map((t) => t.id).join(",");
  const pls = (snap.playlists || [])
    .map((p) => `${p.id}:${p.name}:${p.tracks.length}`)
    .join("|");
  const recent = (snap.recentlyPlayed || [])
    .slice(0, 10)
    .map((t) => t.id)
    .join(",");
  return [
    liked,
    pls,
    recent,
    snap.preferences?.theme,
    snap.preferences?.atmosPreset,
    Object.keys(snap.deletedLikedAt || {}).length,
    Object.keys(snap.deletedPlaylistsAt || {}).length,
  ].join("##");
}

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { theme, themeUpdatedAt, applySyncedTheme } = useTheme();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    queue,
    atmosPreset,
    likedTracks,
    playlists,
    recentlyPlayed,
    downloadedTracks,
    syncMeta,
    applySyncedSnapshot,
    playTrackAt,
    setPlayState,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    togglePlay,
    setAtmosPreset,
  } = usePlayer();

  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const platform = useMemo(() => detectPlatformKind(), []);
  const [deviceName, setDeviceNameState] = useState<string>(() =>
    detectDefaultDeviceName(platform)
  );
  const [lanPin, setLanPinState] = useState<string>(() => {
    try {
      return localStorage.getItem(LAN_PIN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [appVersion, setAppVersion] = useState<string>("1.4.0");

  // Option 1: Cloud Sync
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudRoomId, setCloudRoomId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLOUD_ROOM_KEY) || null;
    } catch {
      return null;
    }
  });
  const [cloudLinkedEmail, setCloudLinkedEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLOUD_EMAIL_KEY) || null;
    } catch {
      return null;
    }
  });
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>("idle");
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudDevices, setCloudDevices] = useState<SyncDevicePresence[]>([]);

  // TV Pairing
  const [tvPairSession, setTvPairSession] = useState<TvPairSessionState | null>(null);
  const [pairMessage, setPairMessage] = useState<string | null>(null);
  const pairCancelRef = useRef<(() => Promise<void>) | null>(null);

  // Option 3: LAN Wi-Fi Discovery & Sync
  const [lanSelfInfo, setLanSelfInfo] = useState<LanDeviceInfo | null>(null);
  const [lanPeers, setLanPeers] = useState<LanDeviceInfo[]>([]);
  const [lanBusy, setLanBusy] = useState(false);
  const [lanMessage, setLanMessage] = useState<string | null>(null);

  // Remote Cast & Continue Listening
  const [activeCastTarget, setActiveCastTarget] = useState<CastDeviceTarget | null>(
    null
  );
  const [remoteContinueListening, setRemoteContinueListening] =
    useState<SyncContinueListening | null>(null);

  // Modal UI state
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectTab, setConnectTab] = useState<ConnectTab>("devices");

  const sessionStartedAtRef = useRef<number>(Date.now());
  const lastAppliedDigestRef = useRef<string>("");
  const lastPushedDigestRef = useRef<string>("");
  const suppressCloudPushUntilRef = useRef<number>(0);
  const lanAutoSyncedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    getCurrentAppVersion().then(setAppVersion).catch(() => {});
  }, []);

  const downloadedById = useMemo(
    () => new Map<string, Track>(downloadedTracks.map((t) => [t.id, t])),
    [downloadedTracks]
  );

  const nowPlayingSummary: LanNowPlayingSummary | null = useMemo(() => {
    if (!currentTrack) return null;
    return {
      title: currentTrack.title,
      artist: currentTrack.artist,
      artwork:
        currentTrack.albumArt && currentTrack.albumArt.length <= 32_768
          ? currentTrack.albumArt
          : null,
      trackId: currentTrack.id,
      isPlaying,
      position: Math.max(0, currentTime || 0),
      duration: Math.max(0, duration || currentTrack.duration || 0),
    };
  }, [currentTrack, duration, currentTime, isPlaying]);

  const buildLocalSnapshot = useCallback((): SyncSnapshot => {
    const now = Date.now();
    const prefTime = Math.max(themeUpdatedAt || 0, syncMeta.atmosUpdatedAt || 0);
    return {
      version: 1,
      updatedAt: now,
      updatedByDeviceId: deviceId,
      updatedByDeviceName: deviceName,
      likedTracks,
      likedTrackAddedAt: syncMeta.likedTrackAddedAt,
      deletedLikedAt: syncMeta.deletedLikedAt,
      playlists,
      playlistUpdatedAt: syncMeta.playlistUpdatedAt,
      deletedPlaylistsAt: syncMeta.deletedPlaylistsAt,
      recentlyPlayed,
      recentlyPlayedAt: syncMeta.recentlyPlayedAt,
      preferences: {
        theme,
        atmosPreset,
        updatedAt: prefTime,
      },
      continueListening: currentTrack
        ? {
            track: currentTrack,
            position: Math.max(0, currentTime || 0),
            duration: Math.max(0, duration || currentTrack.duration || 0),
            isPlaying,
            deviceId,
            deviceName,
            updatedAt: now,
          }
        : null,
    };
  }, [
    atmosPreset,
    currentTime,
    currentTrack,
    deviceId,
    deviceName,
    duration,
    isPlaying,
    likedTracks,
    playlists,
    recentlyPlayed,
    syncMeta,
    theme,
    themeUpdatedAt,
  ]);

  const buildSnapshotRef = useRef(buildLocalSnapshot);
  useEffect(() => {
    buildSnapshotRef.current = buildLocalSnapshot;
  }, [buildLocalSnapshot]);

  const applyMergedRemote = useCallback(
    (remote: SyncSnapshot) => {
      const local = buildSnapshotRef.current();
      const merged = mergeSyncSnapshots(local, remote, downloadedById);
      const nextDigest = computeSnapshotDigest(merged);
      const localDigest = computeSnapshotDigest(local);

      if (
        merged.continueListening &&
        merged.continueListening.track &&
        merged.continueListening.deviceId !== deviceId
      ) {
        const dismissedAt = Number(
          localStorage.getItem(CONTINUE_DISMISSED_KEY) || "0"
        );
        if ((merged.continueListening.updatedAt || 0) > dismissedAt) {
          setRemoteContinueListening(merged.continueListening);
        }
      }

      if (nextDigest === localDigest && nextDigest === lastAppliedDigestRef.current) {
        return;
      }

      suppressCloudPushUntilRef.current = Date.now() + 2000;
      lastAppliedDigestRef.current = nextDigest;
      applySyncedSnapshot(merged);
      if (
        merged.preferences &&
        (merged.preferences.updatedAt || 0) > themeUpdatedAt
      ) {
        applySyncedTheme(merged.preferences.theme, merged.preferences.updatedAt);
      }
    },
    [
      applySyncedSnapshot,
      applySyncedTheme,
      deviceId,
      downloadedById,
      themeUpdatedAt,
    ]
  );

  // Refs to handle remote cast commands reliably inside listeners
  const castHandlerRef = useRef<(cmd: LanCastCommand) => void>(() => {});
  useEffect(() => {
    castHandlerRef.current = (cmd: LanCastCommand) => {
      if (!cmd || cmd.fromDeviceId === deviceId) return;
      switch (cmd.action) {
        case "play_track":
          if (cmd.track) {
            playTrackAt(
              cmd.track,
              cmd.position ?? 0,
              cmd.queue && cmd.queue.length > 0 ? cmd.queue : undefined
            );
          }
          break;
        case "play":
          setPlayState(true);
          break;
        case "pause":
          setPlayState(false);
          break;
        case "toggle":
          togglePlay();
          break;
        case "next":
          playNext();
          break;
        case "prev":
          playPrev();
          break;
        case "seek":
          if (typeof cmd.position === "number") {
            seekTo(cmd.position);
          }
          break;
        case "set_volume":
          if (typeof cmd.volume === "number") {
            const norm = cmd.volume > 1 ? cmd.volume / 100 : cmd.volume;
            setVolume(norm);
          }
          break;
        case "set_atmos":
          if (cmd.atmosPreset) {
            setAtmosPreset(cmd.atmosPreset);
          }
          break;
        case "sync_now":
          if (cloudRoomId && cloudUser) {
            pushSnapshotToCloudRoom(
              cloudRoomId,
              cloudUser,
              buildSnapshotRef.current(),
              downloadedById
            ).catch(() => {});
          }
          break;
      }
    };
  }, [
    cloudRoomId,
    cloudUser,
    deviceId,
    downloadedById,
    playNext,
    playPrev,
    playTrackAt,
    seekTo,
    setAtmosPreset,
    setPlayState,
    setVolume,
    togglePlay,
  ]);

  // Option 3: Initialize Rust LAN Discovery & Listeners
  useEffect(() => {
    initLanSync({
      deviceId,
      deviceName,
      platform,
      roomId: cloudRoomId,
      lanPin: lanPin || null,
    })
      .then((info) => {
        if (info) setLanSelfInfo(info);
      })
      .catch(() => {});

    getLanDevices()
      .then((res) => {
        if (res) {
          setLanSelfInfo(res.selfInfo);
          setLanPeers(res.peers);
        }
      })
      .catch(() => {});
  }, [cloudRoomId, deviceId, deviceName, lanPin, platform]);

  useEffect(() => {
    let unPeers: (() => void) | null = null;
    let unSync: (() => void) | null = null;
    let unCast: (() => void) | null = null;

    onLanPeersUpdated((peers) => setLanPeers(peers)).then((u) => {
      unPeers = u;
    });
    onLanSyncReceived((snap) => {
      applyMergedRemote(snap);
      setLanMessage("Synced over local Wi-Fi");
    }).then((u) => {
      unSync = u;
    });
    onLanCastCommand((cmd) => castHandlerRef.current(cmd)).then((u) => {
      unCast = u;
    });

    const interval = window.setInterval(() => {
      getLanDevices()
        .then((res) => {
          if (res) {
            setLanSelfInfo(res.selfInfo);
            setLanPeers(res.peers);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      window.clearInterval(interval);
      unPeers?.();
      unSync?.();
      unCast?.();
    };
  }, [applyMergedRemote]);

  // Keep Rust LAN snapshot + nowPlaying fresh (throttled cleanly)
  const lastLanSnapshotPushRef = useRef<number>(0);
  useEffect(() => {
    const now = Date.now();
    const delay =
      now - lastLanSnapshotPushRef.current > 2500 ? 150 : 2500;
    const timer = window.setTimeout(() => {
      lastLanSnapshotPushRef.current = Date.now();
      updateLanSnapshot(buildSnapshotRef.current(), nowPlayingSummary).catch(
        () => {}
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    likedTracks,
    playlists,
    recentlyPlayed,
    theme,
    atmosPreset,
    currentTrack?.id,
    isPlaying,
    Math.floor((currentTime || 0) / 5),
    nowPlayingSummary,
  ]);

  // Auto Wi-Fi sync between devices sharing the same Cloud Room on LAN!
  useEffect(() => {
    if (!cloudRoomId || lanPeers.length === 0) return;
    const now = Date.now();
    for (const peer of lanPeers) {
      if (peer.roomId && peer.roomId === cloudRoomId) {
        const last = lanAutoSyncedRef.current[peer.deviceId] || 0;
        if (now - last > 60_000 && peer.updatedAt > last) {
          lanAutoSyncedRef.current[peer.deviceId] = now;
          syncWithLanPeer(peer.ip, peer.port, lanPin || null)
            .then((snap) => {
              if (snap) applyMergedRemote(snap);
            })
            .catch(() => {});
        }
      }
    }
  }, [applyMergedRemote, cloudRoomId, lanPeers, lanPin]);

  // Option 1: Subscribe to Firebase Auth & automatically ensure user room
  useEffect(() => {
    const unsub = subscribeAuthUser(async (user) => {
      setCloudUser(user);
      if (!user) {
        setCloudDevices([]);
        return;
      }

      // Non-anonymous accounts own/resolve their activeRoomId
      if (!user.isAnonymous) {
        try {
          const rid = await ensureUserSyncRoom(user, buildSnapshotRef.current());
          setCloudRoomId(rid);
          localStorage.setItem(CLOUD_ROOM_KEY, rid);
          if (user.email) {
            setCloudLinkedEmail(user.email);
            localStorage.setItem(CLOUD_EMAIL_KEY, user.email);
          }
        } catch (err) {
          setCloudError(
            err instanceof Error ? err.message : "Could not initialize cloud sync."
          );
        }
      }
    });
    return unsub;
  }, []);

  // Option 1: Real-time Firestore room listener + device presence + cloud cast commands
  useEffect(() => {
    if (!cloudUser || !cloudRoomId) return;

    setCloudStatus("syncing");
    setCloudError(null);

    // Initial push-merge transaction
    pushSnapshotToCloudRoom(
      cloudRoomId,
      cloudUser,
      buildSnapshotRef.current(),
      downloadedById
    )
      .then((merged) => {
        applyMergedRemote(merged);
        lastPushedDigestRef.current = computeSnapshotDigest(merged);
        setLastCloudSyncAt(Date.now());
        setCloudStatus("synced");
      })
      .catch((err) => {
        setCloudError(
          err instanceof Error ? err.message : "Cloud sync error."
        );
        setCloudStatus("error");
      });

    const unsubRoom = subscribeToSyncRoom({
      roomId: cloudRoomId,
      myDeviceId: deviceId,
      sessionStartedAt: sessionStartedAtRef.current,
      onSnapshotData: (remoteSnap) => {
        applyMergedRemote(remoteSnap);
        setLastCloudSyncAt(Date.now());
        setCloudStatus("synced");
      },
      onDevicesChange: (list) => {
        const now = Date.now();
        setCloudDevices(
          list.filter(
            (d) => d.deviceId !== deviceId && now - (d.lastSeenAt || 0) < 180_000
          )
        );
      },
      onCommand: (cmd) => castHandlerRef.current(cmd),
      onError: (err) => {
        setCloudError(err.message);
        setCloudStatus("error");
      },
    });

    // Heartbeat presence every 25s
    const sendPresence = () => {
      publishCloudDevicePresence({
        roomId: cloudRoomId,
        deviceId,
        deviceName,
        platform,
        appVersion,
        ownerUid: cloudUser.uid,
        nowPlaying: nowPlayingSummary,
      }).catch(() => {});
    };
    sendPresence();
    const presenceTimer = window.setInterval(sendPresence, 25_000);

    return () => {
      unsubRoom();
      window.clearInterval(presenceTimer);
    };
  }, [
    appVersion,
    applyMergedRemote,
    cloudRoomId,
    cloudUser,
    deviceId,
    deviceName,
    downloadedById,
    platform,
  ]);

  // Update presence promptly when active track/playState shifts
  useEffect(() => {
    if (!cloudUser || !cloudRoomId) return;
    const t = window.setTimeout(() => {
      publishCloudDevicePresence({
        roomId: cloudRoomId,
        deviceId,
        deviceName,
        platform,
        appVersion,
        ownerUid: cloudUser.uid,
        nowPlaying: nowPlayingSummary,
      }).catch(() => {});
    }, 800);
    return () => window.clearTimeout(t);
  }, [
    appVersion,
    cloudRoomId,
    cloudUser,
    currentTrack?.id,
    deviceId,
    deviceName,
    isPlaying,
    platform,
  ]);

  // Debounced auto-push local changes (Liked Songs, Playlists, Recently Played, Theme, Atmos) to Cloud Firestore
  useEffect(() => {
    if (!cloudUser || !cloudRoomId) return;
    if (Date.now() < suppressCloudPushUntilRef.current) return;

    const snap = buildSnapshotRef.current();
    const digest = computeSnapshotDigest(snap);
    if (digest === lastPushedDigestRef.current) return;

    const timer = window.setTimeout(() => {
      if (Date.now() < suppressCloudPushUntilRef.current) return;
      const latest = buildSnapshotRef.current();
      const latestDigest = computeSnapshotDigest(latest);
      if (latestDigest === lastPushedDigestRef.current) return;

      setCloudStatus("syncing");
      pushSnapshotToCloudRoom(cloudRoomId, cloudUser, latest, downloadedById)
        .then((merged) => {
          lastPushedDigestRef.current = computeSnapshotDigest(merged);
          setLastCloudSyncAt(Date.now());
          setCloudStatus("synced");
        })
        .catch((err) => {
          setCloudError(err instanceof Error ? err.message : "Sync failed.");
          setCloudStatus("error");
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [
    atmosPreset,
    cloudRoomId,
    cloudUser,
    downloadedById,
    likedTracks,
    playlists,
    recentlyPlayed,
    theme,
  ]);

  // Public actions
  const setDeviceName = useCallback((name: string) => {
    const clean = name.trim().slice(0, 60) || "Skymusic Device";
    setDeviceNameState(clean);
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  }, []);

  const setLanPin = useCallback((pin: string) => {
    const clean = pin.trim().slice(0, 12);
    setLanPinState(clean);
    localStorage.setItem(LAN_PIN_KEY, clean);
  }, []);

  const signInCloud = useCallback(async (email: string, password: string) => {
    setCloudError(null);
    setCloudStatus("syncing");
    try {
      await signInCloudAccount(email, password);
    } catch (err) {
      setCloudStatus("error");
      const msg = err instanceof Error ? err.message : "Sign in failed.";
      setCloudError(msg);
      throw err;
    }
  }, []);

  const signUpCloud = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setCloudError(null);
      setCloudStatus("syncing");
      try {
        await signUpCloudAccount(email, password, displayName);
      } catch (err) {
        setCloudStatus("error");
        const msg = err instanceof Error ? err.message : "Account creation failed.";
        setCloudError(msg);
        throw err;
      }
    },
    []
  );

  const quickStartCloud = useCallback(async () => {
    setCloudError(null);
    setCloudStatus("syncing");
    try {
      const user = await ensureCloudAuthForPairing();
      const rid = await ensureUserSyncRoom(user, buildSnapshotRef.current());
      setCloudRoomId(rid);
      localStorage.setItem(CLOUD_ROOM_KEY, rid);
      setCloudLinkedEmail("Quick Sync Room");
      localStorage.setItem(CLOUD_EMAIL_KEY, "Quick Sync Room");
    } catch (err) {
      setCloudStatus("error");
      const msg = err instanceof Error ? err.message : "Failed to start Quick Sync.";
      setCloudError(msg);
      throw err;
    }
  }, []);

  const signOutCloud = useCallback(async () => {
    await pairCancelRef.current?.().catch(() => {});
    pairCancelRef.current = null;
    setTvPairSession(null);
    setCloudRoomId(null);
    setCloudLinkedEmail(null);
    setCloudDevices([]);
    localStorage.removeItem(CLOUD_ROOM_KEY);
    localStorage.removeItem(CLOUD_EMAIL_KEY);
    setCloudStatus("idle");
    setCloudError(null);
    await signOutCloudAccount().catch(() => {});
  }, []);

  const syncCloudNow = useCallback(async () => {
    if (!cloudUser) {
      throw new Error("Sign in or pair with a TV code first.");
    }
    setCloudStatus("syncing");
    setCloudError(null);
    try {
      let targetRoomId = cloudRoomId;
      if (!targetRoomId) {
        targetRoomId = await ensureUserSyncRoom(
          cloudUser,
          buildSnapshotRef.current()
        );
        setCloudRoomId(targetRoomId);
        localStorage.setItem(CLOUD_ROOM_KEY, targetRoomId);
        if (cloudUser.email) {
          setCloudLinkedEmail(cloudUser.email);
          localStorage.setItem(CLOUD_EMAIL_KEY, cloudUser.email);
        }
      }
      const merged = await pushSnapshotToCloudRoom(
        targetRoomId,
        cloudUser,
        buildSnapshotRef.current(),
        downloadedById
      );
      applyMergedRemote(merged);
      lastPushedDigestRef.current = computeSnapshotDigest(merged);
      setLastCloudSyncAt(Date.now());
      setCloudStatus("synced");
    } catch (err) {
      setCloudStatus("error");
      const msg = err instanceof Error ? err.message : "Cloud sync failed.";
      setCloudError(msg);
      throw err;
    }
  }, [applyMergedRemote, cloudRoomId, cloudUser, downloadedById]);

  const startTvPairSession = useCallback(async () => {
    setPairMessage(null);
    await pairCancelRef.current?.().catch(() => {});
    const session = await generateTvPairCode({
      tvDeviceId: deviceId,
      tvDeviceName: deviceName,
      onLinked: ({ roomId, linkedByEmail }) => {
        setTvPairSession(null);
        pairCancelRef.current = null;
        setCloudRoomId(roomId);
        localStorage.setItem(CLOUD_ROOM_KEY, roomId);
        const label = linkedByEmail || "Linked Account";
        setCloudLinkedEmail(label);
        localStorage.setItem(CLOUD_EMAIL_KEY, label);
        setPairMessage(`Linked to ${label}! Syncing your library now...`);
      },
      onError: (err) => {
        setPairMessage(err.message);
      },
    });
    pairCancelRef.current = session.cancel;
    setTvPairSession({ code: session.code, expiresAt: session.expiresAt });
  }, [deviceId, deviceName]);

  const cancelTvPairSession = useCallback(async () => {
    await pairCancelRef.current?.().catch(() => {});
    pairCancelRef.current = null;
    setTvPairSession(null);
  }, []);

  const linkTvWithCode = useCallback(
    async (rawCode: string): Promise<string> => {
      setPairMessage(null);
      let user = cloudUser;
      let roomId = cloudRoomId;
      if (!user) {
        user = await ensureCloudAuthForPairing();
      }
      if (!roomId) {
        roomId = await ensureUserSyncRoom(user, buildSnapshotRef.current());
        setCloudRoomId(roomId);
        localStorage.setItem(CLOUD_ROOM_KEY, roomId);
        if (!cloudLinkedEmail) {
          const label = user.email || "Quick Sync Room";
          setCloudLinkedEmail(label);
          localStorage.setItem(CLOUD_EMAIL_KEY, label);
        }
      }
      const res = await linkTvWithPairCode({
        rawCode,
        roomId,
        linkerUser: user,
      });
      setPairMessage(`Paired with ${res.tvDeviceName}!`);
      return res.tvDeviceName;
    },
    [cloudLinkedEmail, cloudRoomId, cloudUser]
  );

  const refreshLan = useCallback(async () => {
    setLanBusy(true);
    try {
      const res = await refreshLanDiscovery();
      if (res) {
        setLanSelfInfo(res.selfInfo);
        setLanPeers(res.peers);
      }
    } finally {
      setLanBusy(false);
    }
  }, []);

  const probeLanAddress = useCallback(async (ip: string, port?: number) => {
    setLanBusy(true);
    setLanMessage(null);
    try {
      const info = await probeLanIp(ip, port);
      setLanMessage(`Connected to ${info.deviceName} (${info.ip})`);
      return info;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Peer unreachable.";
      setLanMessage(msg);
      throw err;
    } finally {
      setLanBusy(false);
    }
  }, []);

  const syncWithLanDevice = useCallback(
    async (peer: LanDeviceInfo) => {
      setLanBusy(true);
      setLanMessage(null);
      try {
        await updateLanSnapshot(buildSnapshotRef.current(), nowPlayingSummary);
        const peerSnap = await syncWithLanPeer(
          peer.ip,
          peer.port,
          lanPin || null
        );
        if (peerSnap) {
          applyMergedRemote(peerSnap);
        }
        setLanMessage(`Synced library directly with ${peer.deviceName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Wi-Fi sync failed.";
        setLanMessage(msg);
        throw err;
      } finally {
        setLanBusy(false);
      }
    },
    [applyMergedRemote, lanPin, nowPlayingSummary]
  );

  const castCommand = useCallback(
    async (
      target: CastDeviceTarget,
      action: LanCastAction,
      opts?: {
        track?: Track | null;
        queue?: Track[] | null;
        position?: number;
        volume?: number;
        muted?: boolean;
        atmosPreset?: AtmosPreset;
      }
    ) => {
      const cmd: LanCastCommand = {
        action,
        fromDeviceId: deviceId,
        fromDeviceName: deviceName,
        track: opts?.track ?? null,
        queue: opts?.queue ?? null,
        position: opts?.position ?? null,
        volume: opts?.volume ?? null,
        muted: opts?.muted ?? null,
        atmosPreset: opts?.atmosPreset ?? null,
        pin: lanPin || null,
        timestamp: Date.now(),
      };

      // Prefer LAN direct Wi-Fi when peer is discovered locally (instant <20ms)
      const matchingLanPeer =
        target.kind === "lan" && target.ip && target.port
          ? target
          : lanPeers.find((p) => p.deviceId === target.deviceId);

      if (matchingLanPeer && matchingLanPeer.ip && matchingLanPeer.port) {
        const updatedInfo = await sendLanCast(
          matchingLanPeer.ip,
          matchingLanPeer.port,
          cmd
        );
        setActiveCastTarget((prev) =>
          prev && prev.deviceId === target.deviceId
            ? { ...prev, nowPlaying: updatedInfo.nowPlaying ?? prev.nowPlaying }
            : prev
        );
        return;
      }

      if (cloudRoomId && cloudUser) {
        await sendCloudCastCommand({
          roomId: cloudRoomId,
          targetDeviceId: target.deviceId,
          command: cmd,
        });
        return;
      }

      throw new Error("Target device is offline on both Wi-Fi and Cloud.");
    },
    [cloudRoomId, cloudUser, deviceId, deviceName, lanPeers, lanPin]
  );

  const handoffPlaybackTo = useCallback(
    async (target: CastDeviceTarget, pauseLocal = true) => {
      if (!currentTrack) {
        throw new Error("Play a song first to cast it to another device.");
      }
      await castCommand(target, "play_track", {
        track: currentTrack,
        queue: queue.slice(0, 50),
        position: Math.max(0, Math.floor(currentTime || 0)),
      });
      setActiveCastTarget(target);
      if (pauseLocal && isPlaying) {
        setPlayState(false);
      }
    },
    [castCommand, currentTime, currentTrack, isPlaying, queue, setPlayState]
  );

  const resumeContinueListening = useCallback(async () => {
    if (!remoteContinueListening?.track) return;
    await playTrackAt(
      remoteContinueListening.track,
      remoteContinueListening.position
    );
    localStorage.setItem(
      CONTINUE_DISMISSED_KEY,
      String(remoteContinueListening.updatedAt || Date.now())
    );
    setRemoteContinueListening(null);
  }, [playTrackAt, remoteContinueListening]);

  const dismissContinueListening = useCallback(() => {
    if (remoteContinueListening) {
      localStorage.setItem(
        CONTINUE_DISMISSED_KEY,
        String(remoteContinueListening.updatedAt || Date.now())
      );
    }
    setRemoteContinueListening(null);
  }, [remoteContinueListening]);

  const openConnectModal = useCallback(
    (tab: ConnectTab = "devices") => {
      setConnectTab(tab);
      setIsConnectOpen(true);
      refreshLanDiscovery().catch(() => {});
      if (cloudUser && !cloudUser.isAnonymous && !cloudRoomId) {
        ensureUserSyncRoom(cloudUser, buildSnapshotRef.current())
          .then((rid) => {
            setCloudRoomId(rid);
            localStorage.setItem(CLOUD_ROOM_KEY, rid);
            setCloudError(null);
            if (cloudUser.email) {
              setCloudLinkedEmail(cloudUser.email);
              localStorage.setItem(CLOUD_EMAIL_KEY, cloudUser.email);
            }
          })
          .catch(() => {});
      }
    },
    [cloudRoomId, cloudUser]
  );

  const closeConnectModal = useCallback(() => {
    setIsConnectOpen(false);
  }, []);

  return (
    <SyncContext.Provider
      value={{
        deviceId,
        deviceName,
        setDeviceName,
        platform,
        lanPin,
        setLanPin,
        cloudUser,
        cloudRoomId,
        cloudLinkedEmail,
        isCloudConnected: Boolean(cloudUser && cloudRoomId),
        cloudStatus,
        cloudError,
        lastCloudSyncAt,
        cloudDevices,
        signInCloud,
        signUpCloud,
        quickStartCloud,
        signOutCloud,
        syncCloudNow,
        tvPairSession,
        pairMessage,
        startTvPairSession,
        cancelTvPairSession,
        linkTvWithCode,
        lanSelfInfo,
        lanPeers,
        lanBusy,
        lanMessage,
        refreshLan,
        probeLanAddress,
        syncWithLanDevice,
        activeCastTarget,
        selectCastTarget: setActiveCastTarget,
        castCommand,
        handoffPlaybackTo,
        remoteContinueListening,
        resumeContinueListening,
        dismissContinueListening,
        isConnectOpen,
        connectTab,
        openConnectModal,
        closeConnectModal,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
