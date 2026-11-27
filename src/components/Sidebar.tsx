import React from "react";
import {
  Disc3,
  FolderOpen,
  Home,
  Library,
  Search,
  Settings,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { NavTab } from "../types/music";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { playlists, likedTracks, importLocalTracks } = usePlayer();

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
    <aside className="hidden h-full w-64 shrink-0 flex-col gap-2 bg-black p-2 md:flex">
      {/* Brand Header */}
      <div className="rounded-xl bg-[#181818] p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] shadow-lg shadow-[#0EA5E9]/20">
            <Disc3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              Skymusic
            </h1>
            <p className="text-[11px] text-zinc-400">High Quality Audio</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="rounded-xl bg-[#181818] p-2">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-[#242424] text-white"
                  : "text-zinc-400 hover:bg-[#242424]/50 hover:text-white"
              }`}
            >
              <span className={active ? "text-[#0EA5E9]" : ""}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Playlists & Local Files Shortcut */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-[#181818] p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Playlists
          </span>
          <button
            onClick={() => {
              importLocalTracks().then(() => onSelectTab("library"));
            }}
            className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Open local MP3/FLAC/WAV files"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[#0EA5E9]" />
            Local
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          <button
            onClick={() => onSelectTab("library")}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-zinc-300 hover:bg-[#242424]"
          >
            <span className="truncate font-medium">Liked Songs</span>
            <span className="text-xs text-zinc-500">{likedTracks.length}</span>
          </button>

          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => onSelectTab("library")}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-zinc-300 hover:bg-[#242424]"
            >
              <span className="truncate">{pl.name}</span>
              <span className="text-xs text-zinc-500">{pl.tracks.length}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
