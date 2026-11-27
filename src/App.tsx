import React, { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";
import { MobileNav } from "./components/MobileNav";
import { NowPlayingModal } from "./components/NowPlayingModal";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Sidebar } from "./components/Sidebar";
import { UpdateModal } from "./components/UpdateModal";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { NavTab } from "./types/music";
import {
  installSpatialDpadNavigation,
  invokeBackHandlers,
  isTvMode,
  registerBackHandler,
  syncTvRootAttribute,
} from "./utils/tvNavigation";
import { checkForUpdates, UpdateInfo } from "./utils/updater";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

const AppShell: React.FC = () => {
  const { theme } = useTheme();
  const {
    currentTrack,
    isPlaying,
    isNowPlayingOpen,
    setNowPlayingOpen,
    isQueueOpen,
    setQueueOpen,
  } = usePlayer();
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(
    null
  );
  const [tvMode, setTvMode] = useState<boolean>(() => syncTvRootAttribute());

  // Sync TV mode attribute & listen for preference toggles
  useEffect(() => {
    setTvMode(syncTvRootAttribute());
    const onTvChange = () => setTvMode(isTvMode());
    window.addEventListener("skymusic-tv-mode-change", onTvChange);
    const cleanupDpad = installSpatialDpadNavigation();
    return () => {
      window.removeEventListener("skymusic-tv-mode-change", onTvChange);
      cleanupDpad();
    };
  }, []);

  // Register global Android / TV Remote Back stack handler
  useEffect(() => {
    window.__skymusicHandleBack = () => {
      if (availableUpdate) {
        setAvailableUpdate(null);
        return true;
      }
      if (isQueueOpen) {
        setQueueOpen(false);
        return true;
      }
      if (isNowPlayingOpen) {
        setNowPlayingOpen(false);
        return true;
      }
      if (invokeBackHandlers()) {
        return true;
      }
      if (activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      return false;
    };

    const unregDefault = registerBackHandler(() => false);
    return () => {
      unregDefault();
      delete window.__skymusicHandleBack;
    };
  }, [
    activeTab,
    availableUpdate,
    isNowPlayingOpen,
    isQueueOpen,
    setNowPlayingOpen,
    setQueueOpen,
  ]);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      checkForUpdates().then((info) => {
        if (info?.available) {
          setAvailableUpdate(info);
        }
      });
    }, 2500);

    const interval = setInterval(() => {
      checkForUpdates().then((info) => {
        if (info?.available) {
          setAvailableUpdate(info);
        }
      });
    }, 30 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden transition-colors duration-300 ${
        tvMode ? "p-1.5" : ""
      }`}
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-primary)",
      }}
    >
      {/* Dynamic Ambient Mesh Backdrop for Glassmorphism Theme */}
      {theme === "glass" && (
        <div
          aria-hidden="true"
          className="sky-glass-aurora pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >
          {currentTrack?.albumArt && (
            <img
              src={currentTrack.albumArt}
              alt=""
              className={`h-full w-full scale-125 object-cover blur-3xl transition-opacity duration-700 ${
                isPlaying ? "opacity-30 animate-pulse" : "opacity-20"
              }`}
              style={{ animationDuration: "8s" }}
            />
          )}
          <div className="sky-glass-aurora absolute inset-0 opacity-80 mix-blend-screen" />
          <div className="absolute inset-0 bg-slate-950/35" />
        </div>
      )}

      {/* Main Desktop + Content Row */}
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        <main
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{ background: "var(--bg-main)" }}
        >
          {/* Mobile Top Header */}
          <header
            className="sky-surface flex shrink-0 items-center justify-between border-b px-4 py-3 md:hidden"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954]">
                <Disc3 className="h-4 w-4 text-white" />
              </div>
              <span
                className="text-base font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Skymusic
              </span>
            </div>
          </header>

          {/* Scrollable Page Content */}
          <div
            className={`flex-1 overflow-y-auto ${
              tvMode ? "px-6 pt-4" : "px-4 pt-4 md:px-8 md:pt-6"
            }`}
          >
            {activeTab === "home" && <HomeView />}
            {activeTab === "search" && <SearchView />}
            {activeTab === "library" && <LibraryView />}
            {activeTab === "settings" && (
              <SettingsView onUpdateFound={(info) => setAvailableUpdate(info)} />
            )}
          </div>
        </main>
      </div>

      {/* Persistent Player Bar */}
      <div className="relative z-10 shrink-0">
        <PlayerBar />
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="relative z-10 shrink-0">
        <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />
      </div>

      {/* Slide-over Queue Drawer */}
      <QueueDrawer />

      {/* Full-Screen Animated Now Playing & Lyrics View */}
      <NowPlayingModal />

      {/* In-App Update Notification Dialog */}
      <UpdateModal
        update={availableUpdate}
        onClose={() => setAvailableUpdate(null)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </ThemeProvider>
  );
}
