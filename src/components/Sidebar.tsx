import React from "react";
import {
  Disc3,
  FolderOpen,
  Home,
  Library,
  MonitorSmartphone,
  Search,
  Settings,
  Tv,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { useSync } from "../context/SyncContext";
import { NavTab } from "../types/music";
import { useTvMode } from "../utils/tvNavigation";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { playlists, likedTracks, importLocalTracks } = usePlayer();
  const {
    openConnectModal,
    isCloudConnected,
    lanPeers,
    cloudDevices,
  } = useSync();
  const tvMode = useTvMode();
  const onlineCount = new Set([
    ...lanPeers.map((p) => p.deviceId),
    ...cloudDevices.map((d) => d.deviceId),
  ]).size;

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="h-5 w-5" /> },
    { id: "search", label: "Search", icon: <Search className="h-5 w-5" /> },
    {
      id: "library",
      label: "Your Library",
      icon: <Library className="h-5 w-5" />,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col gap-2 md:flex ${
        tvMode ? "w-52 p-1.5" : "w-64 p-2"
      }`}
      style={{ backgroundColor: "var(--bg-sidebar-shell)" }}
    >
      {/* Brand Header */}
      <div className={`sky-card rounded-xl ${tvMode ? "p-3" : "p-4"}`}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] shadow-lg shadow-[#0EA5E9]/20">
            <Disc3 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1
                className="truncate text-lg font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Skymusic
              </h1>
              {tvMode && (
                <span className="inline-flex items-center gap-0.5 rounded bg-[#0EA5E9]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#38bdf8]">
                  <Tv className="h-2.5 w-2.5" />
                  TV
                </span>
              )}
            </div>
            <p className="truncate text-[11px]" style={{ color: "var(--text-secondary)" }}>
              High Quality Audio
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sky-card rounded-xl p-2">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              data-active={active ? "true" : undefined}
              data-tv-autofocus={active ? "true" : undefined}
              onClick={() => onSelectTab(item.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: active ? "var(--bg-card-hover)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <span style={{ color: active ? "var(--accent-primary)" : "inherit" }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => openConnectModal("devices")}
          className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="flex items-center gap-3">
            <MonitorSmartphone
              className="h-5 w-5"
              style={{
                color:
                  isCloudConnected || onlineCount > 0
                    ? "var(--accent-green)"
                    : "inherit",
              }}
            />
            Connect &amp; Sync
          </span>
          {(onlineCount > 0 || isCloudConnected) && (
            <span className="rounded-full bg-[#1DB954]/20 px-2 py-0.5 text-[10px] font-bold text-[#1DB954]">
              {onlineCount > 0 ? onlineCount : "On"}
            </span>
          )}
        </button>
      </nav>

      {/* Playlists & Local Files Shortcut */}
      <div className="sky-card flex min-h-0 flex-1 flex-col rounded-xl p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            Playlists
          </span>
          <button
            onClick={() => {
              importLocalTracks().then(() => onSelectTab("library"));
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-primary)",
            }}
            title="Open local MP3/FLAC/WAV files"
          >
            <FolderOpen
              className="h-3.5 w-3.5"
              style={{ color: "var(--accent-primary)" }}
            />
            Local
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          <button
            onClick={() => onSelectTab("library")}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-card-hover)]"
            style={{ color: "var(--text-primary)" }}
          >
            <span className="truncate font-medium">Liked Songs</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {likedTracks.length}
            </span>
          </button>

          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => onSelectTab("library")}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="truncate">{pl.name}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {pl.tracks.length}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
