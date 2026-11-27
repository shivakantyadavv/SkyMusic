import React, { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Disc3,
  FolderOpen,
  Loader2,
  Moon,
  Music2,
  Palette,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { ATMOS_PRESETS } from "../audio/spatialAudio";
import { AtmosToggleButton } from "../components/AudioControlsBadges";
import { usePlayer } from "../context/PlayerContext";
import { ThemeMode, useTheme } from "../context/ThemeContext";
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

interface ThemeOption {
  id: ThemeMode;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "dark",
    label: "Dark Mode",
    description: "Deep slate & charcoal",
    icon: Moon,
  },
  {
    id: "light",
    label: "Light Mode",
    description: "Crisp daylight contrast",
    icon: Sun,
  },
  {
    id: "glass",
    label: "Glass Effect",
    description: "Frosted aurora & blur",
    icon: Sparkles,
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onUpdateFound,
}) => {
  const {
    likedTracks,
    downloadedTracks,
    playlists,
    localTracks,
    atmosPreset,
    setAtmosPreset,
    importLocalTracks,
    clearQueue,
  } = usePlayer();
  const { theme, setTheme } = useTheme();
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
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          Settings
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Customize theme appearance, local music, audio cache, and app updates.
        </p>
      </div>

      {/* Appearance & Theme */}
      <section className="sky-card rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#8B5CF6] text-white">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Appearance &amp; Theme
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Switch instantly between Dark, Light, and frosted Glassmorphism.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                aria-pressed={selected}
                className={`group relative flex flex-col overflow-hidden rounded-xl border p-3 text-left transition-all ${
                  selected
                    ? "border-[#0EA5E9] bg-[#0EA5E9]/10 ring-2 ring-[#0EA5E9]/40"
                    : "border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[#0EA5E9]/50 hover:bg-[var(--bg-subtle-hover)]"
                }`}
              >
                {/* Mini Visual App Preview */}
                {opt.id === "dark" && (
                  <div className="mb-3 h-20 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0f1215] p-2">
                    <div className="flex h-full gap-1.5">
                      <div className="w-1/4 rounded bg-[#161a1f] p-1">
                        <div className="mb-1 h-1.5 w-3/4 rounded-full bg-[#0EA5E9]" />
                        <div className="h-1 w-full rounded-full bg-white/15" />
                      </div>
                      <div className="flex flex-1 flex-col justify-between rounded bg-[#161a1f] p-1.5">
                        <div className="flex items-center justify-between">
                          <div className="h-1.5 w-10 rounded-full bg-white/75" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#1DB954]" />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="h-5 rounded bg-[#222830]" />
                          <div className="h-5 rounded bg-[#222830]" />
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#0EA5E9]/70" />
                      </div>
                    </div>
                  </div>
                )}

                {opt.id === "light" && (
                  <div className="mb-3 h-20 w-full overflow-hidden rounded-lg border border-[#cbd5e1] bg-[#f4f6f9] p-2">
                    <div className="flex h-full gap-1.5">
                      <div className="w-1/4 rounded border border-[#e2e8f0] bg-white p-1">
                        <div className="mb-1 h-1.5 w-3/4 rounded-full bg-[#0EA5E9]" />
                        <div className="h-1 w-full rounded-full bg-slate-300" />
                      </div>
                      <div className="flex flex-1 flex-col justify-between rounded border border-[#e2e8f0] bg-white p-1.5">
                        <div className="flex items-center justify-between">
                          <div className="h-1.5 w-10 rounded-full bg-slate-800" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#1DB954]" />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="h-5 rounded border border-slate-200 bg-slate-100" />
                          <div className="h-5 rounded border border-slate-200 bg-slate-100" />
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#0EA5E9]" />
                      </div>
                    </div>
                  </div>
                )}

                {opt.id === "glass" && (
                  <div
                    className="relative mb-3 h-20 w-full overflow-hidden rounded-lg border border-white/25 p-2"
                    style={{
                      background:
                        "radial-gradient(circle at 20% 25%, #0EA5E9 0%, #4338ca 48%, #0f172a 100%)",
                    }}
                  >
                    <div className="flex h-full gap-1.5">
                      <div className="w-1/4 rounded border border-white/20 bg-white/15 p-1 backdrop-blur-sm">
                        <div className="mb-1 h-1.5 w-3/4 rounded-full bg-sky-300" />
                        <div className="h-1 w-full rounded-full bg-white/30" />
                      </div>
                      <div className="flex flex-1 flex-col justify-between rounded border border-white/20 bg-white/12 p-1.5 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div className="h-1.5 w-10 rounded-full bg-white/85" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#1DB954]" />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="h-5 rounded border border-white/15 bg-white/15" />
                          <div className="h-5 rounded border border-white/15 bg-white/15" />
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#1DB954]" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Label & Active Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        selected
                          ? "text-[#0EA5E9]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    />
                    <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                      {opt.label}
                    </span>
                  </div>
                  {selected && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0EA5E9] text-white shadow">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Audio Engine & Dolby Atmos Spatial DSP */}
      <section className="sky-card space-y-4 rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] text-white">
              <Music2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Audio Playback &amp; Dolby Atmos Spatial DSP
              </h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Real-time Web Audio HRTF stereo widening, studio convolver,
                multi-band EQ, and soft dynamics leveling for online streams,
                downloads, and local files.
              </p>
            </div>
          </div>
          <AtmosToggleButton />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ATMOS_PRESETS.map((preset) => {
            const active = atmosPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAtmosPreset(preset.id)}
                className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-[#0EA5E9] bg-[#0EA5E9]/12 ring-1 ring-[#0EA5E9]/40"
                    : "border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[#0EA5E9]/45 hover:bg-[var(--bg-subtle-hover)]"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {preset.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {preset.description}
                  </p>
                </div>
                {active && (
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0EA5E9] text-white">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Local Music Storage */}
      <section className="sky-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Local Music Files
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
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
      <section className="sky-card rounded-2xl p-5">
        <h3 className="mb-3 text-base font-bold text-[var(--text-primary)]">
          Storage &amp; Cache
        </h3>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {likedTracks.length}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Liked Songs
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {downloadedTracks.length}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Downloaded
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {playlists.length}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Playlists
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {localTracks.length}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Local Files
            </p>
          </div>
        </div>

        <button
          onClick={handleClearCache}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-subtle-hover)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Clear Stream Cache &amp; Queue
        </button>

        {notice && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#1DB954]/25 bg-[#1DB954]/15 px-3 py-2 text-xs font-medium text-[var(--accent-green)]">
            <Trash2 className="h-3.5 w-3.5" />
            {notice}
          </p>
        )}
      </section>

      {/* Software Updates & About */}
      <section className="sky-card space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954]">
              <Disc3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                Skymusic {formatShortVersion(appVersion)} ({appVersion})
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
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
          <p className="flex items-center gap-1.5 rounded-lg border border-[#1DB954]/25 bg-[#1DB954]/15 px-3 py-2 text-xs font-medium text-[var(--accent-green)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {updateMsg}
          </p>
        )}
      </section>
    </div>
  );
};
