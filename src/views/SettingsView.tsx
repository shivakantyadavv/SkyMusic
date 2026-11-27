import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Disc3,
  FolderOpen,
  Loader2,
  Music2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { clearYoutubeCache } from "../services/youtubeResolver";
import {
  checkForUpdates,
  formatShortVersion,
  getCurrentAppVersion,
  UpdateInfo,
} from "../utils/updater";

interface SettingsViewProps {
  onUpdateFound?: (info: UpdateInfo) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onUpdateFound,
}) => {
  const { likedTracks, playlists, localTracks, importLocalTracks, clearQueue } =
    usePlayer();
  const [notice, setNotice] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    getCurrentAppVersion().then(setAppVersion);
  }, []);

  const handleClearCache = () => {
    clearYoutubeCache();
    clearQueue();
    setNotice("Audio stream cache & play queue cleared.");
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      const info = await checkForUpdates();
      if (info?.available) {
        onUpdateFound?.(info);
      } else {
        setUpdateMsg(
          `You are on the latest version (${formatShortVersion(appVersion)}).`
        );
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-sm text-zinc-400">
          Manage local music, audio playback cache, and app updates.
        </p>
      </div>

      {/* Audio Engine Info */}
      <section className="rounded-2xl bg-[#181818] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] text-white">
            <Music2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Full-Length Audio Playback
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Skymusic automatically matches searched songs to full-length audio
              streams via the YouTube IFrame Player with seamless preview
              fallback if a specific video cannot be embedded.
            </p>
          </div>
        </div>
      </section>

      {/* Local Music Storage */}
      <section className="rounded-2xl bg-[#181818] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">Local Music Files</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Play offline .mp3, .flac, .wav, .ogg, and .m4a files stored on
              your device ({localTracks.length} loaded).
            </p>
          </div>
          <button
            onClick={importLocalTracks}
            className="inline-flex items-center gap-2 rounded-full bg-[#0EA5E9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7]"
          >
            <FolderOpen className="h-4 w-4" />
            Import Audio Files
          </button>
        </div>
      </section>

      {/* Cache & Library Stats */}
      <section className="rounded-2xl bg-[#181818] p-5">
        <h3 className="mb-3 text-base font-bold text-white">
          Storage &amp; Cache
        </h3>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#121212] p-3 text-center">
            <p className="text-lg font-bold text-white">{likedTracks.length}</p>
            <p className="text-[11px] text-zinc-400">Liked Songs</p>
          </div>
          <div className="rounded-xl bg-[#121212] p-3 text-center">
            <p className="text-lg font-bold text-white">{playlists.length}</p>
            <p className="text-[11px] text-zinc-400">Playlists</p>
          </div>
          <div className="rounded-xl bg-[#121212] p-3 text-center">
            <p className="text-lg font-bold text-white">{localTracks.length}</p>
            <p className="text-[11px] text-zinc-400">Local Files</p>
          </div>
        </div>

        <button
          onClick={handleClearCache}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Clear Stream Cache &amp; Queue
        </button>

        {notice && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#1DB954]/15 px-3 py-2 text-xs text-[#1DB954]">
            <Trash2 className="h-3.5 w-3.5" />
            {notice}
          </p>
        )}
      </section>

      {/* Software Updates & About */}
      <section className="space-y-3 rounded-2xl bg-[#181818] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954]">
              <Disc3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Skymusic {formatShortVersion(appVersion)} ({appVersion})
              </p>
              <p className="text-xs text-zinc-400">
                Cross-platform music player for Windows &amp; Android (com.skymusic.app)
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 text-xs font-bold text-black transition hover:bg-[#1ed760] disabled:opacity-60"
          >
            {checkingUpdate ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Check for Updates
              </>
            )}
          </button>
        </div>

        {updateMsg && (
          <p className="flex items-center gap-1.5 rounded-lg bg-[#1DB954]/15 px-3 py-2 text-xs text-[#1DB954]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {updateMsg}
          </p>
        )}
      </section>
    </div>
  );
};
