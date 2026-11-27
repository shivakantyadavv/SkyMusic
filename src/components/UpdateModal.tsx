import React, { useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import {
  formatShortVersion,
  installAppUpdate,
  UpdateInfo,
} from "../utils/updater";

interface UpdateModalProps {
  update: UpdateInfo | null;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  update,
  onClose,
}) => {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!update || !update.available) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    setProgress(0);
    try {
      await installAppUpdate(update, (pct) => setProgress(pct));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to download and install update."
      );
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-2xl">
        {/* Top Accent Banner */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#0EA5E9]/25 to-[#1DB954]/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Update Available • {update.shortVersion}
              </h2>
              <p className="text-xs text-zinc-300">
                Current version: {formatShortVersion(update.currentVersion)}
              </p>
            </div>
          </div>

          {!installing && (
            <button
              onClick={onClose}
              className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
              aria-label="Close update modal"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Changelog Body */}
        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              What&apos;s New
            </p>
            <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#121212] p-3.5 text-xs leading-relaxed text-zinc-200">
              {update.notes || "Performance improvements and bug fixes."}
            </div>
          </div>

          {installing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Downloading update...</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#1DB954] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {!installing && (
              <button
                onClick={onClose}
                className="rounded-full px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                Later
              </button>
            )}
            <button
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2 text-xs font-bold text-black shadow-lg transition hover:bg-[#1ed760] disabled:opacity-60"
            >
              {installing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {update.platform === "android"
                    ? "Download & Install Update"
                    : "Update & Relaunch"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
