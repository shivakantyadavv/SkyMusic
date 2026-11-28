import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  LanCastAction,
  LanCastCommand,
  LanNowPlayingSummary,
  SyncDevicePresence,
  SyncSnapshot,
  Track,
} from "../types/music";
import {
  mergeSyncSnapshots,
  sanitizeSnapshotForTransport,
} from "../utils/syncMerge";
import { firebaseAuth, firestoreDb } from "./firebaseClient";

export interface TvPairCodeDoc {
  code: string;
  tvUid: string;
  tvDeviceId: string;
  tvDeviceName: string;
  status: "waiting" | "linked";
  roomId: string | null;
  linkedByUid: string | null;
  linkedByEmail?: string | null;
  linkedAt?: number | null;
  createdAt: number;
  expiresAt: number;
}

export interface CloudCastCommandDoc {
  id: string;
  targetDeviceId: string;
  action: LanCastAction;
  fromDeviceId: string;
  fromDeviceName: string;
  track?: Track | null;
  queue?: Track[] | null;
  position?: number | null;
  volume?: number | null;
  muted?: boolean | null;
  atmosPreset?: "music" | "movie" | "bass" | "off" | null;
  timestamp: number;
}

const TRACK_ALLOWED_KEYS = new Set([
  "id",
  "title",
  "artist",
  "album",
  "albumArt",
  "duration",
  "streamUrl",
  "source",
  "externalUrl",
  "artistId",
  "albumId",
  "localPath",
  "fileName",
  "downloadedAt",
  "quality",
  "ytVideoId",
]);

function stripUndefinedDeep<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return val;
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen);
}

function sanitizeTrackForFirestore(raw: Track): Track {
  const sanitized = stripUndefinedDeep(raw);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (TRACK_ALLOWED_KEYS.has(k)) {
      out[k] = v;
    }
  }
  out.id = clampString(out.id || `trk-${Date.now()}`, 512) || `trk-${Date.now()}`;
  out.title = clampString(out.title || "Untitled", 500);
  out.artist = clampString(out.artist || "Unknown Artist", 500);
  if (typeof out.album === "string") out.album = clampString(out.album, 500);
  if (typeof out.albumArt === "string") {
    out.albumArt =
      out.albumArt.length > 32768 ? "" : clampString(out.albumArt, 32768);
  }
  if (typeof out.streamUrl === "string") {
    out.streamUrl =
      out.streamUrl.length > 4096 ? null : clampString(out.streamUrl, 4096);
  }
  if (typeof out.externalUrl === "string") {
    out.externalUrl = clampString(out.externalUrl, 2048);
  }
  if (typeof out.ytVideoId === "string") {
    out.ytVideoId = clampString(out.ytVideoId, 64);
  }
  if (typeof out.duration !== "number" || !Number.isFinite(out.duration) || out.duration < 0) {
    out.duration = 0;
  }
  if (
    out.source !== "deezer" &&
    out.source !== "itunes" &&
    out.source !== "local" &&
    out.source !== "downloaded"
  ) {
    out.source = "deezer";
  }
  if (out.quality && typeof out.quality === "object") {
    const q = out.quality as Record<string, unknown>;
    const tier =
      q.tier === "lossless" ||
      q.tier === "atmos" ||
      q.tier === "hq" ||
      q.tier === "preview" ||
      q.tier === "unknown"
        ? q.tier
        : "unknown";
    const cleanQ: Record<string, unknown> = {
      badge: clampString(q.badge || "HQ", 64),
      detail: clampString(q.detail || "Audio", 128),
      tier,
    };
    if (typeof q.codec === "string") cleanQ.codec = clampString(q.codec, 64);
    if (typeof q.bitrateKbps === "number" && q.bitrateKbps >= 0) {
      cleanQ.bitrateKbps = q.bitrateKbps;
    }
    if (typeof q.sampleRateHz === "number" && q.sampleRateHz >= 0) {
      cleanQ.sampleRateHz = q.sampleRateHz;
    }
    if (typeof q.bitDepth === "number" && q.bitDepth >= 0) {
      cleanQ.bitDepth = q.bitDepth;
    }
    out.quality = cleanQ;
  }
  return out as unknown as Track;
}

function capRecordKeys<T>(
  map: Record<string, T> | undefined,
  maxKeys: number
): Record<string, T> {
  const entries = Object.entries(map || {});
  if (entries.length <= maxKeys) return Object.fromEntries(entries);
  return Object.fromEntries(entries.slice(0, maxKeys));
}

export function sanitizeSnapshotForFirestore(snap: SyncSnapshot): SyncSnapshot {
  const clean = sanitizeSnapshotForTransport(snap);
  const safeTheme =
    clean.preferences?.theme === "light" || clean.preferences?.theme === "glass"
      ? clean.preferences.theme
      : "dark";
  const safeAtmos =
    clean.preferences?.atmosPreset === "music" ||
    clean.preferences?.atmosPreset === "movie" ||
    clean.preferences?.atmosPreset === "bass" ||
    clean.preferences?.atmosPreset === "off"
      ? clean.preferences.atmosPreset
      : "off";

  return stripUndefinedDeep({
    version: 1 as const,
    updatedAt: Math.max(0, Number(clean.updatedAt) || Date.now()),
    updatedByDeviceId: clampString(clean.updatedByDeviceId || "", 128),
    updatedByDeviceName: clampString(clean.updatedByDeviceName || "", 128),
    likedTracks: (clean.likedTracks || []).slice(0, 500).map(sanitizeTrackForFirestore),
    likedTrackAddedAt: capRecordKeys(clean.likedTrackAddedAt, 600),
    deletedLikedAt: capRecordKeys(clean.deletedLikedAt, 500),
    playlists: (clean.playlists || []).slice(0, 100).map((pl) => ({
      ...pl,
      tracks: (pl.tracks || []).slice(0, 200).map(sanitizeTrackForFirestore),
    })),
    playlistUpdatedAt: capRecordKeys(clean.playlistUpdatedAt, 150),
    deletedPlaylistsAt: capRecordKeys(clean.deletedPlaylistsAt, 500),
    recentlyPlayed: (clean.recentlyPlayed || [])
      .slice(0, 20)
      .map(sanitizeTrackForFirestore),
    recentlyPlayedAt: capRecordKeys(clean.recentlyPlayedAt, 50),
    preferences: {
      theme: safeTheme,
      atmosPreset: safeAtmos,
      updatedAt: Math.max(0, Number(clean.preferences?.updatedAt) || 0),
    },
    continueListening: clean.continueListening
      ? {
          track: clean.continueListening.track
            ? sanitizeTrackForFirestore(clean.continueListening.track)
            : null,
          position: Math.max(0, Number(clean.continueListening.position) || 0),
          duration: Math.max(0, Number(clean.continueListening.duration) || 0),
          isPlaying: Boolean(clean.continueListening.isPlaying),
          deviceId: clampString(clean.continueListening.deviceId || "", 128),
          deviceName: clampString(clean.continueListening.deviceName || "", 128),
          updatedAt: Math.max(0, Number(clean.continueListening.updatedAt) || 0),
        }
      : null,
  });
}

export function subscribeAuthUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, cb);
}

export async function signUpCloudAccount(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(
    firebaseAuth,
    email.trim(),
    password
  );
  if (displayName?.trim()) {
    await updateProfile(cred.user, {
      displayName: clampString(displayName.trim(), 100),
    }).catch(() => {});
  }
  return cred.user;
}

export async function signInCloudAccount(
  email: string,
  password: string
): Promise<User> {
  const cred = await signInWithEmailAndPassword(
    firebaseAuth,
    email.trim(),
    password
  );
  return cred.user;
}

export async function ensureCloudAuthForPairing(): Promise<User> {
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }
  const cred = await signInAnonymously(firebaseAuth);
  return cred.user;
}

export async function signOutCloudAccount(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function ensureUserSyncRoom(
  user: User,
  initialSnapshot: SyncSnapshot
): Promise<string> {
  const userRef = doc(firestoreDb, "users", user.uid);
  const now = Date.now();
  let roomId = user.uid;

  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const existingRoomId = userSnap.data()?.activeRoomId;
    if (typeof existingRoomId === "string" && existingRoomId.trim()) {
      roomId = existingRoomId.trim();
    }
  } else {
    await setDoc(
      userRef,
      stripUndefinedDeep({
        uid: user.uid,
        email: user.email || null,
        displayName: clampString(user.displayName || "", 100) || null,
        activeRoomId: roomId,
        updatedAt: now,
      })
    );
  }

  const roomRef = doc(firestoreDb, "syncRooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    await setDoc(roomRef, {
      ownerUid: user.uid,
      memberUids: [user.uid],
      updatedAt: now,
      snapshot: sanitizeSnapshotForFirestore(initialSnapshot),
    });
  }
  return roomId;
}

export async function pushSnapshotToCloudRoom(
  roomId: string,
  user: User,
  localSnapshot: SyncSnapshot,
  localDownloadedById?: Map<string, Track>
): Promise<SyncSnapshot> {
  const roomRef = doc(firestoreDb, "syncRooms", roomId);
  const cleanLocal = sanitizeSnapshotForFirestore(localSnapshot);
  let resultingMerged = cleanLocal;

  await runTransaction(firestoreDb, async (tx) => {
    const docSnap = await tx.get(roomRef);
    const now = Date.now();
    if (!docSnap.exists()) {
      tx.set(roomRef, {
        ownerUid: user.uid,
        memberUids: [user.uid],
        updatedAt: now,
        snapshot: cleanLocal,
      });
      resultingMerged = cleanLocal;
      return;
    }

    const existing = docSnap.data();
    const remoteSnap = existing.snapshot as SyncSnapshot | undefined;
    const merged = remoteSnap
      ? mergeSyncSnapshots(cleanLocal, remoteSnap, localDownloadedById)
      : cleanLocal;
    const cleanMerged = sanitizeSnapshotForFirestore(merged);
    resultingMerged = cleanMerged;

    tx.update(roomRef, {
      ownerUid: existing.ownerUid,
      memberUids: existing.memberUids,
      updatedAt: now,
      snapshot: cleanMerged,
    });
  });

  return resultingMerged;
}

export async function generateTvPairCode(params: {
  tvDeviceId: string;
  tvDeviceName: string;
  onLinked: (info: { roomId: string; linkedByEmail?: string | null }) => void;
  onError: (err: Error) => void;
}): Promise<{
  code: string;
  expiresAt: number;
  cancel: () => Promise<void>;
}> {
  const user = await ensureCloudAuthForPairing();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeRef = doc(firestoreDb, "tvPairCodes", code);

  await setDoc(codeRef, {
    code,
    tvUid: user.uid,
    tvDeviceId: clampString(params.tvDeviceId, 128),
    tvDeviceName: clampString(params.tvDeviceName || "Android TV", 128),
    status: "waiting",
    roomId: null,
    linkedByUid: null,
    linkedByEmail: null,
    linkedAt: null,
    createdAt: now,
    expiresAt,
  });

  let done = false;
  const unsub = onSnapshot(
    codeRef,
    (snap) => {
      if (!snap.exists() || done) return;
      const data = snap.data() as TvPairCodeDoc;
      if (data.status === "linked" && data.roomId) {
        done = true;
        unsub();
        deleteDoc(codeRef).catch(() => {});
        params.onLinked({
          roomId: data.roomId,
          linkedByEmail: data.linkedByEmail,
        });
      }
    },
    (err) => {
      if (!done) params.onError(err);
    }
  );

  return {
    code,
    expiresAt,
    cancel: async () => {
      done = true;
      unsub();
      await deleteDoc(codeRef).catch(() => {});
    },
  };
}

export async function linkTvWithPairCode(params: {
  rawCode: string;
  roomId: string;
  linkerUser: User;
}): Promise<{ tvDeviceName: string; tvUid: string }> {
  const code = params.rawCode.replace(/\D/g, "").slice(0, 6);
  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error("Enter a valid 6-digit TV code.");
  }

  const codeRef = doc(firestoreDb, "tvPairCodes", code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error("TV pair code not found. Check the code on your TV.");
  }
  const data = codeSnap.data() as TvPairCodeDoc;
  if (data.status !== "waiting") {
    throw new Error("This TV code has already been used.");
  }
  if (data.expiresAt <= Date.now()) {
    await deleteDoc(codeRef).catch(() => {});
    throw new Error("TV code expired. Generate a fresh code on TV.");
  }

  // Authorize the TV's UID in the owner's syncRoom first
  const roomRef = doc(firestoreDb, "syncRooms", params.roomId);
  await updateDoc(roomRef, {
    memberUids: arrayUnion(data.tvUid),
    updatedAt: Date.now(),
  });

  await updateDoc(codeRef, {
    status: "linked",
    roomId: params.roomId,
    linkedByUid: params.linkerUser.uid,
    linkedByEmail: params.linkerUser.email || null,
    linkedAt: Date.now(),
  });

  return {
    tvDeviceName: data.tvDeviceName || "Android TV",
    tvUid: data.tvUid,
  };
}

export async function publishCloudDevicePresence(params: {
  roomId: string;
  deviceId: string;
  deviceName: string;
  platform: "desktop" | "tv" | "mobile";
  appVersion: string;
  ownerUid: string;
  nowPlaying: LanNowPlayingSummary | null;
}): Promise<void> {
  const devRef = doc(
    firestoreDb,
    "syncRooms",
    params.roomId,
    "devices",
    clampString(params.deviceId, 128)
  );
  const cleanNp = params.nowPlaying
    ? {
        title: clampString(params.nowPlaying.title || "", 500),
        artist: clampString(params.nowPlaying.artist || "", 500),
        artwork: params.nowPlaying.artwork
          ? clampString(params.nowPlaying.artwork, 32768)
          : null,
        trackId: params.nowPlaying.trackId
          ? clampString(params.nowPlaying.trackId, 512)
          : null,
        isPlaying: Boolean(params.nowPlaying.isPlaying),
        position: Math.max(0, Number(params.nowPlaying.position) || 0),
        duration: Math.max(0, Number(params.nowPlaying.duration) || 0),
      }
    : null;

  await setDoc(
    devRef,
    stripUndefinedDeep({
      deviceId: clampString(params.deviceId, 128),
      deviceName: clampString(params.deviceName || "Skymusic", 128),
      platform: params.platform,
      appVersion: clampString(params.appVersion || "1.4.0", 64),
      ownerUid: params.ownerUid,
      nowPlaying: cleanNp,
      lastSeenAt: Date.now(),
    })
  );
}

export async function sendCloudCastCommand(params: {
  roomId: string;
  targetDeviceId: string;
  command: LanCastCommand;
}): Promise<void> {
  const cmdCol = collection(firestoreDb, "syncRooms", params.roomId, "commands");
  const payload: Record<string, unknown> = {
    targetDeviceId: clampString(params.targetDeviceId, 128),
    action: params.command.action,
    fromDeviceId: clampString(params.command.fromDeviceId, 128),
    fromDeviceName: clampString(params.command.fromDeviceName || "Device", 128),
    track: params.command.track
      ? sanitizeTrackForFirestore(params.command.track)
      : null,
    queue: params.command.queue
      ? params.command.queue.slice(0, 100).map(sanitizeTrackForFirestore)
      : null,
    position:
      typeof params.command.position === "number"
        ? Math.max(0, params.command.position)
        : null,
    volume:
      typeof params.command.volume === "number"
        ? Math.max(0, Math.min(100, params.command.volume))
        : null,
    muted:
      typeof params.command.muted === "boolean" ? params.command.muted : null,
    atmosPreset: params.command.atmosPreset || null,
    timestamp: Math.max(0, params.command.timestamp || Date.now()),
  };
  await addDoc(cmdCol, stripUndefinedDeep(payload));
}

export function subscribeToSyncRoom(params: {
  roomId: string;
  myDeviceId: string;
  sessionStartedAt: number;
  onSnapshotData: (snapshot: SyncSnapshot) => void;
  onDevicesChange: (devices: SyncDevicePresence[]) => void;
  onCommand: (cmd: LanCastCommand) => void;
  onError?: (err: Error) => void;
}): () => void {
  const roomRef = doc(firestoreDb, "syncRooms", params.roomId);
  const devicesRef = collection(firestoreDb, "syncRooms", params.roomId, "devices");
  const commandsQ = query(
    collection(firestoreDb, "syncRooms", params.roomId, "commands"),
    where("targetDeviceId", "==", params.myDeviceId)
  );

  const unsubRoom = onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.snapshot) {
        params.onSnapshotData(data.snapshot as SyncSnapshot);
      }
    },
    (err) => params.onError?.(err)
  );

  const unsubDevices = onSnapshot(
    devicesRef,
    (qs) => {
      const list: SyncDevicePresence[] = [];
      qs.forEach((d) => {
        const val = d.data() as SyncDevicePresence;
        if (val?.deviceId) list.push(val);
      });
      params.onDevicesChange(list);
    },
    () => {}
  );

  const handledCmdIds = new Set<string>();
  const unsubCommands = onSnapshot(
    commandsQ,
    (qs) => {
      qs.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const id = change.doc.id;
        if (handledCmdIds.has(id)) return;
        handledCmdIds.add(id);

        const data = change.doc.data() as CloudCastCommandDoc;
        // Delete immediately so it doesn't replay later
        deleteDoc(change.doc.ref).catch(() => {});

        if ((data.timestamp || 0) >= params.sessionStartedAt - 15_000) {
          params.onCommand({
            action: data.action,
            fromDeviceId: data.fromDeviceId,
            fromDeviceName: data.fromDeviceName,
            track: data.track ?? null,
            queue: data.queue ?? null,
            position: data.position ?? null,
            volume: data.volume ?? null,
            muted: data.muted ?? null,
            atmosPreset: data.atmosPreset ?? null,
            timestamp: data.timestamp,
          });
        }
      });
    },
    () => {}
  );

  return () => {
    unsubRoom();
    unsubDevices();
    unsubCommands();
  };
}
