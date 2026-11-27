import React from "react";
import { AudioLines, Check, Download } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { AudioQualityInfo, Track } from "../types/music";

interface QualityBadgeProps {
  quality: AudioQualityInfo;
  compact?: boolean;
  interactive?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({
  quality,
  compact = false,
  interactive = false,
  onClick,
}) => {
  const tierStyles =
    quality.tier === "lossless"
      ? "border-[#1DB954]/45 bg-[#1DB954]/15 text-[#1DB954]"
      : quality.tier === "atmos"
      ? "border-[#0EA5E9]/60 bg-[#0EA5E9]/20 text-[#38bdf8] shadow-[0_0_12px_rgba(14,165,233,0.3)]"
      : quality.tier === "hq"
      ? "border-[#0EA5E9]/30 bg-[#0EA5E9]/10 text-[#0EA5E9]"
      : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]";

  const label = compact ? quality.badge : quality.detail;

  const content = (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold tracking-wider transition ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
      } ${tierStyles} ${
        interactive ? "cursor-pointer hover:brightness-110" : ""
      }`}
      title={quality.detail}
    >
      {quality.tier === "atmos" && <AudioLines className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );

  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} className="inline-flex shrink-0">
        {content}
      </button>
    );
  }

  return content;
};

interface AtmosToggleButtonProps {
  compact?: boolean;
}

export const AtmosToggleButton: React.FC<AtmosToggleButtonProps> = ({
  compact = false,
}) => {
  const { atmosPreset, toggleAtmos } = usePlayer();
  const active = atmosPreset !== "off";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleAtmos();
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-bold transition-all ${
        compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${
        active
          ? "border-[#0EA5E9] bg-[#0EA5E9]/20 text-[#38bdf8] shadow-[0_0_14px_rgba(14,165,233,0.38)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]"
      }`}
      title={
        active
          ? `Dolby Atmos Active (${atmosPreset.toUpperCase()}) • Click to toggle`
          : "Enable Dolby Atmos Spatial Audio"
      }
    >
      {/* Iconic double-D / Spatial Waveform glyph */}
      <svg
        viewBox="0 0 24 14"
        fill="none"
        className={compact ? "h-3 w-4 shrink-0" : "h-3.5 w-5 shrink-0"}
        aria-hidden="true"
      >
        <path
          d="M2 2h3.2C8.4 2 10.5 4.1 10.5 7S8.4 12 5.2 12H2V2Zm2.2 2v6h1c1.8 0 3.1-1.2 3.1-3S7 4 5.2 4h-1Z"
          fill="currentColor"
        />
        <path
          d="M22 2h-3.2C15.6 2 13.5 4.1 13.5 7s2.1 5 5.3 5H22V2Zm-2.2 2v6h-1c-1.8 0-3.1-1.2-3.1-3s1.3-3 3.1-3h1Z"
          fill="currentColor"
        />
      </svg>
      <span>{compact ? "ATMOS" : "Dolby Atmos"}</span>
    </button>
  );
};

interface DownloadTrackButtonProps {
  track: Track;
  size?: "sm" | "md";
  onOverlay?: boolean;
  className?: string;
}

export const DownloadTrackButton: React.FC<DownloadTrackButtonProps> = ({
  track,
  size = "sm",
  onOverlay = false,
  className = "",
}) => {
  const { downloadTrack, isTrackDownloaded, getDownloadProgress } = usePlayer();

  if (track.source === "local") return null;

  const dl = getDownloadProgress(track.id);
  const downloaded = isTrackDownloaded(track) || dl?.status === "completed";
  const inProgress =
    dl &&
    (dl.status === "resolving" ||
      dl.status === "downloading" ||
      dl.status === "tagging");
  const pct = dl?.progress || 0;

  const dim = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const iconDim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (downloaded) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full bg-[#1DB954]/15 text-[#1DB954] ${className}`}
        title="Downloaded for offline HQ playback"
      >
        <Check className={`${iconDim} stroke-[2.75]`} />
      </span>
    );
  }

  if (inProgress) {
    const r = 10;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        className={`relative inline-flex ${dim} shrink-0 items-center justify-center rounded-full text-[#0EA5E9] ${className}`}
        title={`Downloading HQ audio... ${pct}%`}
      >
        <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[8px] font-bold tabular-nums">
          {pct}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        downloadTrack(track);
      }}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full transition ${
        onOverlay
          ? "text-white hover:bg-black/80 hover:text-[#38bdf8]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[#0EA5E9]"
      } ${className}`}
      title="Download High Quality Offline Audio"
      aria-label={`Download ${track.title}`}
    >
      <Download className={iconDim} />
    </button>
  );
};
