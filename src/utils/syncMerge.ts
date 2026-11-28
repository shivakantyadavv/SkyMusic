import {
  Playlist,
  SyncSnapshot,
  SyncTombstoneMap,
  Track,
} from "../types/music";

const MAX_RECENT_SYNC = 20;
const MAX_TOMBSTONES = 400;

function isLoopbackOrLocalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://localhost") ||
    url.startsWith("asset:") ||
    url.startsWith("blob:") ||
    url.startsWith("file:")
  );
}

/**
 * Strips machine-specific local paths and oversized base64 artwork before sending
 * track metadata over Wi-Fi LAN or Cloud Firestore.
 */
export function sanitizeTrackForSync(track: Track): Track {
  const copy: Track = { ...track };
  if (copy.source === "downloaded" || copy.source === "local") {
    if (isLoopbackOrLocalUrl(copy.streamUrl)) {
      copy.streamUrl = null;
    }
    delete copy.localPath;
    delete copy.fileName;
  } else if (isLoopbackOrLocalUrl(copy.streamUrl)) {
    copy.streamUrl = null;
  }

  if (copy.albumArt && copy.albumArt.startsWith("data:") && copy.albumArt.length > 24_000) {
    copy.albumArt = "";
  }
  return copy;
}

/**
 * Normalizes a track received from another device so it plays cleanly locally.
 * If this device already has a local download for the same track ID, keep it!
 */
export function resolveTrackFromSync(
  incoming: Track,
  localDownloadedById?: Map<string, Track>
): Track | null {
  const existingLocal = localDownloadedById?.get(incoming.id);
  if (existingLocal) {
    return existingLocal;
  }

  const normalized: Track = { ...incoming };
  if (normalized.source === "downloaded") {
    // Another device downloaded this track locally; on this device play via online YT/stream.
    normalized.source = "deezer";
    normalized.streamUrl = isLoopbackOrLocalUrl(normalized.streamUrl)
      ? null
      : normalized.streamUrl;
    delete normalized.localPath;
    delete normalized.fileName;
    delete normalized.downloadedAt;
  } else if (normalized.source === "local") {
    // Pure local audio files without online metadata cannot be streamed across devices directly
    // unless a YouTube video ID or external public stream is attached.
    if (!normalized.ytVideoId && isLoopbackOrLocalUrl(normalized.streamUrl)) {
      normalized.streamUrl = null;
    }
    delete normalized.localPath;
  }
  return normalized;
}

function pruneTombstones(map: SyncTombstoneMap): SyncTombstoneMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_TOMBSTONES) return map;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_TOMBSTONES));
}

export function sanitizeSnapshotForTransport(snapshot: SyncSnapshot): SyncSnapshot {
  return {
    ...snapshot,
    likedTracks: snapshot.likedTracks.map(sanitizeTrackForSync),
    playlists: snapshot.playlists.map((pl) => ({
      ...pl,
      coverImage:
        pl.coverImage && pl.coverImage.startsWith("data:") && pl.coverImage.length > 24_000
          ? ""
          : pl.coverImage,
      tracks: pl.tracks.map(sanitizeTrackForSync),
    })),
    recentlyPlayed: snapshot.recentlyPlayed.slice(0, MAX_RECENT_SYNC).map(sanitizeTrackForSync),
    continueListening: snapshot.continueListening
      ? {
          ...snapshot.continueListening,
          track: snapshot.continueListening.track
            ? sanitizeTrackForSync(snapshot.continueListening.track)
            : null,
        }
      : null,
    deletedLikedAt: pruneTombstones(snapshot.deletedLikedAt || {}),
    deletedPlaylistsAt: pruneTombstones(snapshot.deletedPlaylistsAt || {}),
  };
}

/**
 * Deterministic CRDT-style merge combining local state and an incoming remote snapshot
 * from either Cloud Firestore or LAN Wi-Fi Direct sync.
 */
export function mergeSyncSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  localDownloadedById?: Map<string, Track>
): SyncSnapshot {
  // 1. Merge Liked Tracks with add/delete timestamps
  const deletedLikedAt: SyncTombstoneMap = { ...(local.deletedLikedAt || {}) };
  for (const [id, ts] of Object.entries(remote.deletedLikedAt || {})) {
    deletedLikedAt[id] = Math.max(deletedLikedAt[id] || 0, ts);
  }

  const likedTrackAddedAt: Record<string, number> = {
    ...(local.likedTrackAddedAt || {}),
  };
  for (const [id, ts] of Object.entries(remote.likedTrackAddedAt || {})) {
    likedTrackAddedAt[id] = Math.max(likedTrackAddedAt[id] || 0, ts);
  }

  const likedMap = new Map<string, Track>();
  for (const t of local.likedTracks || []) {
    const added = likedTrackAddedAt[t.id] || local.updatedAt || 1;
    if (added >= (deletedLikedAt[t.id] || 0)) {
      likedTrackAddedAt[t.id] = added;
      likedMap.set(t.id, t);
    }
  }
  for (const raw of remote.likedTracks || []) {
    const t = resolveTrackFromSync(raw, localDownloadedById);
    if (!t) continue;
    const added = likedTrackAddedAt[t.id] || remote.updatedAt || 1;
    if (added >= (deletedLikedAt[t.id] || 0)) {
      likedTrackAddedAt[t.id] = added;
      if (!likedMap.has(t.id)) {
        likedMap.set(t.id, t);
      }
    }
  }

  const mergedLikedTracks = Array.from(likedMap.values()).sort(
    (a, b) => (likedTrackAddedAt[b.id] || 0) - (likedTrackAddedAt[a.id] || 0)
  );

  // 2. Merge Playlists with update/delete timestamps
  const deletedPlaylistsAt: SyncTombstoneMap = { ...(local.deletedPlaylistsAt || {}) };
  for (const [id, ts] of Object.entries(remote.deletedPlaylistsAt || {})) {
    deletedPlaylistsAt[id] = Math.max(deletedPlaylistsAt[id] || 0, ts);
  }

  const playlistUpdatedAt: Record<string, number> = {
    ...(local.playlistUpdatedAt || {}),
  };
  for (const [id, ts] of Object.entries(remote.playlistUpdatedAt || {})) {
    playlistUpdatedAt[id] = Math.max(playlistUpdatedAt[id] || 0, ts);
  }

  const localPlMap = new Map<string, Playlist>(
    (local.playlists || []).map((p) => [p.id, p])
  );
  const remotePlMap = new Map<string, Playlist>(
    (remote.playlists || []).map((p) => [p.id, p])
  );
  const allPlIds = new Set([...localPlMap.keys(), ...remotePlMap.keys()]);
  const mergedPlaylists: Playlist[] = [];

  for (const id of allPlIds) {
    const lPl = localPlMap.get(id);
    const rPl = remotePlMap.get(id);
    const lTime = local.playlistUpdatedAt?.[id] || lPl?.createdAt || 0;
    const rTime = remote.playlistUpdatedAt?.[id] || rPl?.createdAt || 0;
    const delTime = deletedPlaylistsAt[id] || 0;
    const maxLiveTime = Math.max(lTime, rTime);

    if (delTime > maxLiveTime) {
      continue;
    }

    let winner: Playlist | undefined;
    if (lPl && rPl) {
      const preferRemote = rTime > lTime;
      const base = preferRemote ? rPl : lPl;
      // Union tracks inside the same playlist if modified close together? Prefer newer ordered list + resolve local downloads
      winner = {
        ...base,
        tracks: base.tracks
          .map((t) => resolveTrackFromSync(t, localDownloadedById))
          .filter((t): t is Track => Boolean(t)),
      };
    } else if (rPl) {
      winner = {
        ...rPl,
        tracks: rPl.tracks
          .map((t) => resolveTrackFromSync(t, localDownloadedById))
          .filter((t): t is Track => Boolean(t)),
      };
    } else {
      winner = lPl;
    }

    if (winner) {
      playlistUpdatedAt[id] = maxLiveTime;
      mergedPlaylists.push(winner);
    }
  }
  mergedPlaylists.sort((a, b) => b.createdAt - a.createdAt);

  // 3. Merge Recently Played (union by track id, most recent first, cap 20)
  const recentlyPlayedAt: Record<string, number> = {
    ...(local.recentlyPlayedAt || {}),
  };
  for (const [id, ts] of Object.entries(remote.recentlyPlayedAt || {})) {
    recentlyPlayedAt[id] = Math.max(recentlyPlayedAt[id] || 0, ts);
  }

  const recentMap = new Map<string, Track>();
  (local.recentlyPlayed || []).forEach((t, idx) => {
    if (!recentlyPlayedAt[t.id]) {
      recentlyPlayedAt[t.id] = Math.max(1, (local.updatedAt || Date.now()) - idx * 1000);
    }
    recentMap.set(t.id, t);
  });
  (remote.recentlyPlayed || []).forEach((raw, idx) => {
    const t = resolveTrackFromSync(raw, localDownloadedById);
    if (!t) return;
    if (!recentlyPlayedAt[t.id]) {
      recentlyPlayedAt[t.id] = Math.max(1, (remote.updatedAt || Date.now()) - idx * 1000);
    }
    if (!recentMap.has(t.id)) {
      recentMap.set(t.id, t);
    }
  });

  const mergedRecent = Array.from(recentMap.values())
    .sort((a, b) => (recentlyPlayedAt[b.id] || 0) - (recentlyPlayedAt[a.id] || 0))
    .slice(0, MAX_RECENT_SYNC);

  // Keep timestamp map clean for retained recent items
  const retainedRecentIds = new Set(mergedRecent.map((t) => t.id));
  const cleanRecentAt: Record<string, number> = {};
  for (const id of retainedRecentIds) {
    if (recentlyPlayedAt[id]) cleanRecentAt[id] = recentlyPlayedAt[id];
  }

  // 4. Preferences (latest wins)
  const localPrefTime = local.preferences?.updatedAt || 0;
  const remotePrefTime = remote.preferences?.updatedAt || 0;
  const preferences =
    remotePrefTime > localPrefTime && remote.preferences
      ? remote.preferences
      : local.preferences;

  // 5. Continue Listening (latest wins)
  const localContTime = local.continueListening?.updatedAt || 0;
  const remoteContTime = remote.continueListening?.updatedAt || 0;
  let continueListening = local.continueListening;
  if (remoteContTime > localContTime && remote.continueListening) {
    continueListening = {
      ...remote.continueListening,
      track: remote.continueListening.track
        ? resolveTrackFromSync(remote.continueListening.track, localDownloadedById)
        : null,
    };
  }

  return {
    version: 1,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    updatedByDeviceId:
      (remote.updatedAt || 0) > (local.updatedAt || 0)
        ? remote.updatedByDeviceId
        : local.updatedByDeviceId,
    updatedByDeviceName:
      (remote.updatedAt || 0) > (local.updatedAt || 0)
        ? remote.updatedByDeviceName
        : local.updatedByDeviceName,
    likedTracks: mergedLikedTracks,
    likedTrackAddedAt,
    deletedLikedAt: pruneTombstones(deletedLikedAt),
    playlists: mergedPlaylists,
    playlistUpdatedAt,
    deletedPlaylistsAt: pruneTombstones(deletedPlaylistsAt),
    recentlyPlayed: mergedRecent,
    recentlyPlayedAt: cleanRecentAt,
    preferences,
    continueListening,
  };
}
