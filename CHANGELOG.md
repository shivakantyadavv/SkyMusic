# Changelog

All notable changes to **Skymusic** are documented in this file.

## [v2.3] - 2026-11-28

### What's New
- feat: redesign NowPlaying with HD scaled album cover backdrop, stacked album carousel, waveform seekbar, and Up Next queue list

## [v2.2] - 2026-11-28

### What's New
- feat: fullscreen auto-adjusting artist backdrop on NowPlaying, audio-beat reactive Fire Sparks & Raindrops visualizer, and zero-overlap bottom-docked controls

## [v2.1] - 2026-11-28

### What's New
- fix: prevent same-speaker echo when setSinkId fails and surface dual Bluetooth hardware/routing status

## [v2.0] - 2026-11-28

### What's New
- fix: unlock Windows audio output device enumeration so all connected Bluetooth speakers (e.g. Mivi + Zebronics) appear in Dual Speaker dropdown

## [v1.9] - 2026-11-28

### What's New
- fix: resolve 320kbps full-song downloads via JioSaavn + yt-dlp fallback so downloads work on both Windows and Android

## [v1.8] - 2026-11-28

### What's New
- feat: add Windows Dual Speaker Output with Echo/Delay Sync slider and Multi-Device Party Sync

## [v1.7] - 2026-11-28

### What's New
- fix: place Dolby Atmos badge inline after song title (icon-only for long titles) and prevent landscape artwork overlap

## [v1.6] - 2026-11-28

### What's New
- fix: Android full-song YouTube playback (was 30s preview)
- fix: NowPlaying DOLBY ATMOS badge no longer overlaps seekbar

## [v1.5] - 2026-11-28

### What's New
- Fix Cloud Firestore Sync permission rules for track metadata & initial room creation
- add Retry Sync and Sign Out controls in Connect dialog

## [v1.4] - 2026-11-28

### What's New
- Real-Time Cloud Sync (Firebase Auth & Firestore) for Liked Songs, Playlists, Recently Played, Theme & Dolby Atmos across Windows, Android & TV
- 6-Digit TV Pair Code + QR Linking without remote password typing
- Offline Wi-Fi Direct LAN Discovery & Sync
- Spotify Connect-style Cast / Play on TV & Handoff controls

## [v1.3] - 2026-11-27

### What's New
- India & Pakistan Top Charts (Top 100 India, Hot Hits Pakistan, Bollywood, Coke Studio & Sufi, Punjabi, 90s Classics) with dynamic Daily Mix rotation
- Spotify-style Playlist numbered song tables & Album detail pages
- Verified Artist Profiles (Arijit Singh, Vishal Mishra, Sonu Nigam, Atif Aslam, Diljit Dosanjh & more)
- Full Android TV / Google TV support with Leanback banner, D-Pad navigation, Voice Search, Media Keys & Foreground MediaSession

## [v1.2] - 2026-11-27

### What's New
- **Dolby Atmos / Spatial 3D Audio Engine** — 4 DSP presets (Auto/Music, Movie/3D, Bass Boost, Off) using Web Audio API binaural widener, Haas delay matrix, multi-band EQ, and dynamics compressor; toggleable from Settings, PlayerBar, and Now Playing
- **High-Quality Song Downloader** — One-tap download with real-time circular progress ring; resolves full-bitrate M4A via InnerTube with lofty metadata embedding; saves to `Music/Skymusic` on Windows & Android; dedicated Downloaded tab in Your Library
- **Live Audio Quality & Codec Badges** — Rust symphonia+lofty inspection for local files (FLAC 24-bit, WAV, MP3 320kbps); stream badges for online playback (HQ 256kbps, DOLBY ATMOS Spatial, 128kbps Preview); displayed on track rows, PlayerBar, and Now Playing
- **Recently Played shelf** — Horizontal scrollable row above Top Trending on Home (top 20 unique tracks, most-recent first, with Clear button; hidden when empty)

## [v1.1] - 2026-11-27

### What's New
- Added Appearance & Theme selector in Settings with live switching across Dark Mode, Light Mode, and Glass Effect (Glassmorphism)
- Refactored all views, modals, lyrics overlay, and player controls to semantic CSS theme variables with persistent storage

## [v1.0] - 2026-11-27

### What's New
- Cross-platform Tauri v2 + React + TypeScript + Tailwind CSS desktop (Windows 11) and mobile (Android) music player.
- Home page with curated suggestion cards & shelves for **Top Trending**, **Top 100 Global**, **Bollywood Hits**, **Hollywood Hits**, and **Punjabi Hits**.
- Fast track, artist, and album search powered by Deezer & iTunes metadata with full-length YouTube IFrame audio streaming and automatic fallback.
- Smooth slide-up **Now Playing** view with time-synced & clickable lyrics via LRCLIB and lyrics.ovh.
- Your Library with Liked Songs, custom local playlists, Queue drawer, and local `.mp3` / `.flac` / `.wav` audio file support.
- In-app update checker with desktop auto-updater (`latest.json`) and Android APK installer integration.
