import React, { useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { BeatFxButton } from "./components/BeatFxButton";
import { BeatVisualizerCanvas } from "./components/BeatVisualizerCanvas";
import { ConnectModal } from "./components/ConnectModal";
import { MobileNav } from "./components/MobileNav";
import { NowPlayingModal } from "./components/NowPlayingModal";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Sidebar } from "./components/Sidebar";
import { UpdateModal } from "./components/UpdateModal";
import { NavigationProvider, useNavigation } from "./context/NavigationContext";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import { SyncProvider, useSync } from "./context/SyncContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { getHdAlbumArt, useBeatFxMode } from "./utils/albumArt";
import {
  installSpatialDpadNavigation,
  invokeBackHandlers,
  isTvMode,
  registerBackHandler,
  syncTvRootAttribute,
} from "./utils/tvNavigation";
import { checkForUpdates, UpdateInfo } from "./utils/updater";
import { AlbumDetailView } from "./views/AlbumDetailView";
import { ArtistProfileView } from "./views/ArtistProfileView";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { PlaylistDetailView } from "./views/PlaylistDetailView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

const AppShell: React.FC = () => {
  const { theme } = useTheme();
  const { activeTab, setActiveTab, currentRoute, clearRoutes } = useNavigation();
  const {
    currentTrack,
    isPlaying,
    isNowPlayingOpen,
    setNowPlayingOpen,
    isQueueOpen,
    setQueueOpen,
  } = usePlayer();
  const {
    isConnectOpen,
    closeConnectModal,
    openConnectModal,
    isCloudConnected,
    lanPeers,
    cloudDevices,
  } = useSync();
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(
    null
  );
  const [tvMode, setTvMode] = useState<boolean>(() => syncTvRootAttribute());
  const { beatFxMode } = useBeatFxMode();

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
      if (isConnectOpen) {
        closeConnectModal();
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
        clearRoutes();
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
    clearRoutes,
    closeConnectModal,
    isConnectOpen,
    isNowPlayingOpen,
    isQueueOpen,
    setActiveTab,
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

  const renderMainContent = () => {
    if (currentRoute) {
      if (currentRoute.type === "playlist") {
        return <PlaylistDetailView section={currentRoute.section} />;
      }
      if (currentRoute.type === "artist") {
        return <ArtistProfileView artist={currentRoute.artist} />;
      }
      if (currentRoute.type === "album") {
        return <AlbumDetailView album={currentRoute.album} />;
      }
    }

    if (activeTab === "home") return <HomeView />;
    if (activeTab === "search") return <SearchView />;
    if (activeTab === "library") return <LibraryView />;
    return <SettingsView onUpdateFound={(info) => setAvailableUpdate(info)} />;
  };

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
      {/* Fullscreen HD Album Cover Blur Backdrop (Dark & Glass Themes) */}
      {(theme === "dark" || theme === "glass") && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#090b0f]"
        >
          {currentTrack?.albumArt && (
            <img
              src={getHdAlbumArt(currentTrack.albumArt)}
              alt=""
              className={`h-full w-full scale-105 object-cover object-center blur-xl transition-all duration-700 ${
                isPlaying ? "opacity-75" : "opacity-55"
              }`}
            />
          )}
          {theme === "glass" && (
            <div className="sky-glass-aurora absolute inset-0 opacity-50 mix-blend-screen" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,11,16,0.34) 0%, rgba(8,11,16,0.42) 45%, rgba(8,11,16,0.68) 100%)",
            }}
          />
        </div>
      )}

      {/* Ambient Beat FX Layer above background & cards (disabled on TV for crisp D-Pad compositing) */}
      {(theme === "dark" || theme === "glass") && !isNowPlayingOpen && !tvMode && (
        <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
          <BeatVisualizerCanvas mode={beatFxMode} isPlaying={isPlaying} />
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
              <img
                src="/skymusic-logo.png"
                alt="Skymusic"
                className="h-7 w-7 shrink-0 rounded-lg object-cover shadow-md"
              />
              <span
                className="text-base font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Skymusic
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BeatFxButton compact />
              <button
                type="button"
                onClick={() => openConnectModal("devices")}
              className="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              title="Connect, Sync & Cast to TV"
            >
              <MonitorSmartphone
                className={`h-4 w-4 ${
                  isCloudConnected || lanPeers.length > 0
                    ? "text-[#1DB954]"
                    : "text-[var(--text-secondary)]"
                }`}
              />
              <span>
                {lanPeers.length + cloudDevices.length > 0
                  ? `${lanPeers.length + cloudDevices.length}`
                  : "Sync"}
              </span>
            </button>
            </div>
          </header>

          {/* Scrollable Page Content */}
          <div
            className={`flex-1 overflow-y-auto ${
              tvMode ? "px-6 pt-4" : "px-4 pt-4 md:px-8 md:pt-6"
            }`}
          >
            {renderMainContent()}
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

      {/* Cross-Device Cloud Sync, TV Pairing & Wi-Fi Connect */}
      <ConnectModal />

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
        <SyncProvider>
          <NavigationProvider>
            <AppShell />
          </NavigationProvider>
        </SyncProvider>
      </PlayerProvider>
    </ThemeProvider>
  );
}
