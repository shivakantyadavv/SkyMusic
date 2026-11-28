import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, Update } from "@tauri-apps/plugin-updater";
import { isTauriEnv, smartFetch } from "../services/http";

export const GITHUB_OWNER = "shivakantyadavv";
export const GITHUB_REPO = "skymusic";

export interface UpdateInfo {
  available: boolean;
  platform: "desktop" | "android";
  currentVersion: string;
  newVersion: string;
  shortVersion: string;
  notes: string;
  date?: string;
  desktopUpdate?: Update;
  androidApkUrl?: string;
  releaseUrl?: string;
}

declare global {
  interface Window {
    __skymusicHandleBack?: () => boolean;
    SkymusicAndroid?: {
      installApk: (filePath: string) => boolean;
      openUrl: (url: string) => void;
      isTv?: () => boolean;
      getDeviceModel?: () => string;
      setKeepScreenOn?: (keepOn: boolean) => void;
      hasVoiceSearch?: () => boolean;
      startVoiceSearch?: () => boolean;
      ensureStoragePermissions?: () => void;
      updateMediaSession?: (
        title: string,
        artist: string,
        album: string,
        artworkUrl: string,
        playing: boolean,
        positionMs: number,
        durationMs: number
      ) => void;
      clearMediaSession?: () => void;
      exportToMusicFolder?: (
        sourcePath: string,
        displayName: string,
        mimeType: string,
        title: string,
        artist: string,
        album: string
      ) => boolean;
    };
  }
}

export function isAndroidPlatform(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

export function formatShortVersion(version: string): string {
  const clean = version.replace(/^v/i, "").trim();
  const parts = clean.split(".");
  if (parts.length >= 2) {
    return `v${parts[0]}.${parts[1]}`;
  }
  return `v${clean}`;
}

export function normalizeSemver(version: string): [number, number, number] {
  const clean = version.replace(/^v/i, "").split("-")[0].trim();
  const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function isVersionNewer(remote: string, current: string): boolean {
  const [rMaj, rMin, rPat] = normalizeSemver(remote);
  const [cMaj, cMin, cPat] = normalizeSemver(current);
  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPat > cPat;
}

export async function getCurrentAppVersion(): Promise<string> {
  if (isTauriEnv()) {
    try {
      return await invoke<string>("get_app_version");
    } catch {
      return "1.0.0";
    }
  }
  return "1.0.0";
}

async function notifyUpdateAvailable(
  shortVersion: string,
  notes: string
): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) {
      sendNotification({
        title: `Skymusic ${shortVersion} Update Available!`,
        body: notes
          ? notes.split("\n")[0].slice(0, 120)
          : "A new version of Skymusic is ready to install.",
      });
    }
  } catch {
    // Notification permission may be declined on device
  }
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (!isTauriEnv()) return null;

  const currentVersion = await getCurrentAppVersion();

  if (isAndroidPlatform()) {
    try {
      const res = await smartFetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github+json",
          },
        }
      );
      if (!res.ok) return null;

      const release = (await res.json()) as {
        tag_name?: string;
        body?: string;
        published_at?: string;
        html_url?: string;
        assets?: { name: string; browser_download_url: string }[];
      };

      const remoteVersion = (release.tag_name || "").replace(/^v/i, "").trim();
      if (!remoteVersion || !isVersionNewer(remoteVersion, currentVersion)) {
        return null;
      }

      const apkAsset = release.assets?.find((a) =>
        a.name.toLowerCase().endsWith(".apk")
      );
      const androidApkUrl =
        apkAsset?.browser_download_url ||
        `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/skymusic.apk`;

      const shortVersion = formatShortVersion(remoteVersion);
      const notes = release.body || "Bug fixes and performance improvements.";

      await notifyUpdateAvailable(shortVersion, notes);

      return {
        available: true,
        platform: "android",
        currentVersion,
        newVersion: remoteVersion,
        shortVersion,
        notes,
        date: release.published_at,
        androidApkUrl,
        releaseUrl: release.html_url,
      };
    } catch {
      return null;
    }
  }

  // Desktop (Windows) via official Tauri Updater plugin
  try {
    const update = await check();
    if (!update) return null;

    const shortVersion = formatShortVersion(update.version);
    const notes = update.body || "New features and improvements.";

    await notifyUpdateAvailable(shortVersion, notes);

    return {
      available: true,
      platform: "desktop",
      currentVersion: update.currentVersion || currentVersion,
      newVersion: update.version,
      shortVersion,
      notes,
      date: update.date,
      desktopUpdate: update,
    };
  } catch {
    return null;
  }
}

export async function installAppUpdate(
  info: UpdateInfo,
  onProgress: (percent: number) => void
): Promise<void> {
  if (info.platform === "desktop" && info.desktopUpdate) {
    let downloaded = 0;
    let totalLength = 0;

    await info.desktopUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalLength = event.data.contentLength || 0;
        onProgress(0);
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (totalLength > 0) {
          onProgress(Math.min(100, Math.round((downloaded / totalLength) * 100)));
        }
      } else if (event.event === "Finished") {
        onProgress(100);
      }
    });

    await relaunch();
    return;
  }

  if (info.platform === "android" && info.androidApkUrl) {
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<number>("apk-download-progress", (e) => {
        onProgress(e.payload);
      });

      const apkPath = await invoke<string>("download_apk_to_cache", {
        url: info.androidApkUrl,
      });
      onProgress(100);

      if (window.SkymusicAndroid?.installApk) {
        const launched = window.SkymusicAndroid.installApk(apkPath);
        if (!launched) {
          throw new Error(
            "Please allow 'Install unknown apps' permission for Skymusic and tap Install again."
          );
        }
      } else {
        window.open(info.androidApkUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      if (unlisten) unlisten();
    }
  }
}
