import React, { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";
import { MobileNav } from "./components/MobileNav";
import { NowPlayingModal } from "./components/NowPlayingModal";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Sidebar } from "./components/Sidebar";
import { UpdateModal } from "./components/UpdateModal";
import { PlayerProvider } from "./context/PlayerContext";
import { NavTab } from "./types/music";
import { checkForUpdates, UpdateInfo } from "./utils/updater";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

const AppShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(
    null
  );

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
    <div className="flex h-full flex-col bg-[#121212] text-white">
      {/* Main Desktop + Content Row */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#1a222b] via-[#121212] to-[#121212]">
          {/* Mobile Top Header */}
          <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 md:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#1DB954]">
                <Disc3 className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold tracking-tight">
                Skymusic
              </span>
            </div>
          </header>

          {/* Scrollable Page Content */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 md:px-8 md:pt-6">
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
      <PlayerBar />

      {/* Mobile Bottom Navigation */}
      <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />

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
    <PlayerProvider>
      <AppShell />
    </PlayerProvider>
  );
}
