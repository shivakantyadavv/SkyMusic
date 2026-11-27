import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AlbumItem, ArtistItem, DetailRoute, HomeSection, NavTab } from "../types/music";
import { registerBackHandler } from "../utils/tvNavigation";

interface NavigationContextValue {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  currentRoute: DetailRoute | null;
  openPlaylist: (section: HomeSection) => void;
  openArtist: (artist: ArtistItem) => void;
  openAlbum: (album: AlbumItem) => void;
  goBack: () => boolean;
  clearRoutes: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeTab, setActiveTabState] = useState<NavTab>("home");
  const [routeStack, setRouteStack] = useState<DetailRoute[]>([]);

  const currentRoute =
    routeStack.length > 0 ? routeStack[routeStack.length - 1] : null;

  const setActiveTab = useCallback((tab: NavTab) => {
    setRouteStack([]);
    setActiveTabState(tab);
  }, []);

  const openPlaylist = useCallback((section: HomeSection) => {
    setRouteStack((prev) => [...prev, { type: "playlist", section }]);
  }, []);

  const openArtist = useCallback((artist: ArtistItem) => {
    setRouteStack((prev) => [...prev, { type: "artist", artist }]);
  }, []);

  const openAlbum = useCallback((album: AlbumItem) => {
    setRouteStack((prev) => [...prev, { type: "album", album }]);
  }, []);

  const goBack = useCallback((): boolean => {
    if (routeStack.length > 0) {
      setRouteStack((prev) => prev.slice(0, -1));
      return true;
    }
    return false;
  }, [routeStack.length]);

  const clearRoutes = useCallback(() => {
    setRouteStack([]);
  }, []);

  // Automatically participate in TV Remote & Android Back stack
  useEffect(() => {
    if (routeStack.length === 0) return;
    return registerBackHandler(() => {
      setRouteStack((prev) => prev.slice(0, -1));
      return true;
    });
  }, [routeStack.length]);

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        currentRoute,
        openPlaylist,
        openArtist,
        openAlbum,
        goBack,
        clearRoutes,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return ctx;
}
