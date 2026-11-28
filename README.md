# Skymusic

A sleek, cross-platform multi-theme music player built with **Tauri v2**, **React**, **TypeScript**, **Tailwind CSS**, and **Vite** — running natively on **Windows 11** and **Android** from a single codebase.

<!-- LATEST_VERSION_START -->
> **Latest Release:** ![Version](https://img.shields.io/badge/version-v2.1-0EA5E9?style=flat-square) — Released on **2026-11-28**

- fix: prevent same-speaker echo when setSinkId fails and surface dual Bluetooth hardware/routing status
<!-- LATEST_VERSION_END -->

---

## Latest Downloads

Always get the newest build with 1 click:

| Platform | Package | Direct Download |
| --- | --- | --- |
| **Windows 11 (Installer)** | Single-file NSIS Setup (`skymusic_v1.3_x64-setup.exe`) | [Download v1.3 Windows Installer](https://github.com/shivakantyadavv/skymusic/releases/download/v1.3/skymusic_v1.3_x64-setup.exe) |
| **Windows 11 (Standalone)** | Portable Executable (`skymusic.exe`) | [![Download skymusic.exe](https://img.shields.io/badge/Download-skymusic.exe-0EA5E9?style=for-the-badge&logo=windows)](https://github.com/shivakantyadavv/skymusic/releases/latest/download/skymusic.exe) |
| **Windows 11 (Portable Zip)** | Zip Archive (`skymusic_v1.3_windows_portable.zip`) | [Download Portable ZIP](https://github.com/shivakantyadavv/skymusic/releases/download/v1.3/skymusic_v1.3_windows_portable.zip) |
| **Android & Google TV** | Signed Universal APK (`skymusic.apk`) | [![Download skymusic.apk](https://img.shields.io/badge/Download-skymusic.apk-1DB954?style=for-the-badge&logo=android)](https://github.com/shivakantyadavv/skymusic/releases/latest/download/skymusic.apk) |

---

## Key Features

- **India & Pakistan Top Charts + Dynamic Daily Mix:** Full 80–100 song charts for **Top 100 India**, **Hot Hits Pakistan**, **Bollywood Hits**, **Coke Studio Pakistan & Sufi**, **Punjabi Top Charts**, **90s & 2000s Evergreen Hindi**, and **Desi Indie & Hip-Hop**, plus personalized **Made For You** mixes rotating dynamically on launch & refresh.
- **Spotify-Style Playlist Lists & Verified Artist Profiles:** Click any chart/playlist (like **Top 100 India**) to browse a numbered tracklist table with inline search & shuffle, or open dedicated **Artist Profiles** (`Arijit Singh`, `Vishal Mishra`, `Atif Aslam`, `Sonu Nigam`, `Diljit Dosanjh`, `Rahat Fateh Ali Khan`, etc.) with Popular Songs, Albums & Singles, and Related Artists.
- **Android TV / Google TV Ready:** Native `armeabi-v7a` + `arm64-v8a` APK with Google TV Leanback banner, spatial D-Pad remote navigation, hardware Media Keys, Voice Search mic, smart Back-button stack, and widescreen Split Lyrics Theater + foreground `MediaSession` service.
- **Dolby Atmos / Spatial 3D Audio DSP:** Real-time Web Audio processor featuring binaural HRTF stereo widening, studio impulse convolver, multi-band EQ, soft compressor, and selectable presets (`Auto / Music`, `Movie / 3D Surround`, `Bass Boost`, `Off`) toggleable live from PlayerBar, Now Playing, and Settings.
- **High-Quality Offline Downloader:** Download full-length songs with embedded Title, Artist, Album, and Cover Art straight into `Music/Skymusic` on Windows & Android, complete with real-time circular progress and a dedicated **Downloaded** tab in Your Library.
- **Live Audio Quality & Codec Badges:** Rust (`symphonia` + `lofty`) inspects real FLAC/WAV/MP3/M4A sample rate, bit depth, and bitrate, while online streams surface `HQ • 256kbps AAC`, `DOLBY ATMOS • Spatial`, and `128kbps • Preview` pills across rows, PlayerBar, and Now Playing.
- **Recently Played Shelf:** Horizontal scrollable Home row tracking your last 20 unique played songs with 1-click resume and clear controls.
- **Multi-Theme Appearance:** Switch live in **Settings** between **Dark Mode**, **Light Mode**, and **Glass Effect (Glassmorphism)** with persistent storage and zero flash on startup.
- **Full-Length Streaming + Fast Search:** Instant track, artist, and album search backed by Deezer & iTunes metadata (`country=IN`) and direct full-length audio streaming with YouTube IFrame & preview failover.
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
