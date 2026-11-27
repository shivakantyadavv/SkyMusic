# Skymusic

A sleek, cross-platform multi-theme music player built with **Tauri v2**, **React**, **TypeScript**, **Tailwind CSS**, and **Vite** — running natively on **Windows 11** and **Android** from a single codebase.

<!-- LATEST_VERSION_START -->
> **Latest Release:** ![Version](https://img.shields.io/badge/version-v1.0-0EA5E9?style=flat-square) — Released on **2026-11-27**

- Initial public release with full-length music streaming, curated regional & global charts, synced lyrics, and local audio playback.
<!-- LATEST_VERSION_END -->

---

## Latest Downloads

Always get the newest build with 1 click:

| Platform | Package | Direct Download |
| --- | --- | --- |
| **Windows 11 (Installer)** | Single-file NSIS Setup (`skymusic_v1.1_x64-setup.exe`) | [Download v1.1 Windows Installer](https://github.com/shivakantyadavv/skymusic/releases/download/v1.1/skymusic_v1.1_x64-setup.exe) |
| **Windows 11 (Standalone)** | Portable Executable (`skymusic.exe`) | [![Download skymusic.exe](https://img.shields.io/badge/Download-skymusic.exe-0EA5E9?style=for-the-badge&logo=windows)](https://github.com/shivakantyadavv/skymusic/releases/latest/download/skymusic.exe) |
| **Windows 11 (Portable Zip)** | Zip Archive (`skymusic_v1.1_windows_portable.zip`) | [Download Portable ZIP](https://github.com/shivakantyadavv/skymusic/releases/download/v1.1/skymusic_v1.1_windows_portable.zip) |
| **Android** | Signed Universal APK (`skymusic.apk`) | [![Download skymusic.apk](https://img.shields.io/badge/Download-skymusic.apk-1DB954?style=for-the-badge&logo=android)](https://github.com/shivakantyadavv/skymusic/releases/latest/download/skymusic.apk) |

---

## Key Features

- **Multi-Theme Appearance:** Switch live in **Settings** between **Dark Mode**, **Light Mode**, and **Glass Effect (Glassmorphism)** with persistent storage and zero flash on startup.
- **Curated Home Discovery:** Browse **Top Trending**, **Top 100 Global**, **Bollywood Hits**, **Hollywood Hits**, and **Punjabi Hits** in a clean card-grid layout.
- **Full-Length Streaming + Fast Search:** Instant track, artist, and album search backed by Deezer & iTunes metadata and full-length YouTube IFrame playback with automatic failover.
- **Now Playing & Synced Lyrics:** Click the bottom track bar to expand a smooth animated Now Playing screen with live-highlighted, clickable timestamped lyrics.
- **Library & Local Files:** Save Liked Songs, manage custom playlists in `localStorage`, and import offline `.mp3`, `.flac`, `.wav`, `.ogg`, or `.m4a` files on both Windows and Android.
- **Responsive Desktop & Mobile UI:** Left sidebar + bottom persistent player bar on Windows 11; adaptive bottom navigation on Android.
- **Built-In Auto-Updater:** Checks GitHub Releases automatically on launch, sends native OS notifications, auto-installs signed updates on Windows, and triggers in-app APK updates on Android.

---

## Screenshots

| Desktop (Windows 11) | Now Playing & Synced Lyrics |
| --- | --- |
| *Home, Search, Library, Settings Themes (Dark, Light, Glass), and Queue Drawer* | *Slide-up player with theme-adaptive blurred backdrop and time-synced lyrics* |

---

## Development & Release Commands

```powershell
# Run frontend dev server
npm run dev

# Run full Tauri desktop app in dev mode
npm run tauri dev

# Bump version (1.0 -> 1.1 ... 1.9 -> 2.0)
npm run bump

# Full automated release (bump + docs + build + sign + GitHub Release)
npm run release -- --notes "Added awesome new features"
```
