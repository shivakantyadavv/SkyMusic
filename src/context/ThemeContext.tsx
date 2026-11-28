import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "glass";

interface ThemeContextValue {
  theme: ThemeMode;
  themeUpdatedAt: number;
  setTheme: (mode: ThemeMode) => void;
  applySyncedTheme: (mode: ThemeMode, updatedAt: number) => void;
}

const THEME_STORAGE_KEY = "skymusic_theme";
const THEME_UPDATED_KEY = "skymusic_theme_updated_at";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light" || saved === "glass") {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return "dark";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [themeUpdatedAt, setThemeUpdatedAt] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(THEME_UPDATED_KEY);
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme !== "light");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    const now = Date.now();
    setThemeState(mode);
    setThemeUpdatedAt(now);
    try {
      localStorage.setItem(THEME_UPDATED_KEY, String(now));
    } catch {
      // ignore storage errors
    }
  };

  const applySyncedTheme = (mode: ThemeMode, updatedAt: number) => {
    if (mode !== "dark" && mode !== "light" && mode !== "glass") return;
    if (updatedAt <= themeUpdatedAt) return;
    setThemeState(mode);
    setThemeUpdatedAt(updatedAt);
    try {
      localStorage.setItem(THEME_UPDATED_KEY, String(updatedAt));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themeUpdatedAt, setTheme, applySyncedTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
