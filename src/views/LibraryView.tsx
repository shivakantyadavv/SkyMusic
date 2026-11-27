import React, { useState } from "react";
import {
  FolderOpen,
  Heart,
  ListMusic,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { TrackRow } from "../components/TrackRow";
import { usePlayer } from "../context/PlayerContext";

type LibraryTab = "liked" | "playlists" | "local";

export const LibraryView: React.FC = () => {
  const {
    likedTracks,
    playlists,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
    localTracks,
    importLocalTracks,
    playTrack,
  } = usePlayer();

  const [tab, setTab] = useState<LibraryTab>("liked");
  const [newPlName, setNewPlName] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null
  );

  const activePlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    const created = createPlaylist(newPlName);
    setNewPlName("");
    setSelectedPlaylistId(created.id);
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Your Library</h2>

        <div className="flex items-center gap-2 rounded-full bg-[#181818] p-1">
          <button
            onClick={() => {
              setTab("liked");
              setSelectedPlaylistId(null);
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === "liked"
                ? "bg-[#0EA5E9] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Liked ({likedTracks.length})
          </button>
          <button
            onClick={() => setTab("playlists")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === "playlists"
                ? "bg-[#0EA5E9] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Playlists ({playlists.length})
          </button>
          <button
            onClick={() => {
              setTab("local");
              setSelectedPlaylistId(null);
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === "local"
                ? "bg-[#0EA5E9] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Local Files ({localTracks.length})
          </button>
        </div>
      </div>

      {/* Liked Songs */}
      {tab === "liked" && (
        <section>
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-[#0EA5E9]/30 to-[#1DB954]/20 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] shadow-lg">
                <Heart className="h-7 w-7 fill-white text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Liked Songs</h3>
                <p className="text-xs text-zinc-300">
                  {likedTracks.length} tracks saved locally
                </p>
              </div>
            </div>
            {likedTracks.length > 0 && (
              <button
                onClick={() => playTrack(likedTracks[0], likedTracks)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1DB954] text-black shadow-lg transition hover:scale-105"
                title="Play Liked Songs"
              >
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </button>
            )}
          </div>

          {likedTracks.length === 0 ? (
            <div className="rounded-xl bg-[#181818] p-10 text-center text-sm text-zinc-400">
              Tap the heart icon on any track to save it here.
            </div>
          ) : (
            <div className="rounded-xl bg-[#181818] p-2">
              {likedTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={likedTracks}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Playlists */}
      {tab === "playlists" && (
        <section className="space-y-5">
          <form
            onSubmit={handleCreatePlaylist}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              placeholder="New playlist name..."
              className="flex-1 max-w-sm rounded-lg border border-white/10 bg-[#181818] px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#0EA5E9]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0284C7]"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </form>

          {activePlaylist ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-[#181818] p-4">
                <div>
                  <button
                    onClick={() => setSelectedPlaylistId(null)}
                    className="mb-1 text-xs font-medium text-[#0EA5E9] hover:underline"
                  >
                    &larr; All Playlists
                  </button>
                  <h3 className="text-xl font-bold text-white">
                    {activePlaylist.name}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {activePlaylist.tracks.length} tracks
                  </p>
                </div>
                {activePlaylist.tracks.length > 0 && (
                  <button
                    onClick={() =>
                      playTrack(activePlaylist.tracks[0], activePlaylist.tracks)
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954] text-black"
                  >
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </button>
                )}
              </div>

              {activePlaylist.tracks.length === 0 ? (
                <p className="rounded-xl bg-[#181818] p-8 text-center text-sm text-zinc-400">
                  This playlist is empty. Click "+" on any track to add it!
                </p>
              ) : (
                <div className="rounded-xl bg-[#181818] p-2">
                  {activePlaylist.tracks.map((track, idx) => (
                    <div key={track.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <TrackRow
                          track={track}
                          index={idx}
                          contextList={activePlaylist.tracks}
                        />
                      </div>
                      <button
                        onClick={() =>
                          removeTrackFromPlaylist(activePlaylist.id, track.id)
                        }
                        className="mr-2 rounded p-1.5 text-zinc-500 hover:text-red-400"
                        title="Remove from playlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : playlists.length === 0 ? (
            <div className="rounded-xl bg-[#181818] p-10 text-center text-sm text-zinc-400">
              No playlists yet. Create one above!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="group flex cursor-pointer items-center justify-between rounded-xl bg-[#181818] p-4 transition hover:bg-[#242424]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {pl.coverImage ? (
                      <img
                        src={pl.coverImage}
                        alt={pl.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#242424] text-zinc-400">
                        <ListMusic className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {pl.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {pl.tracks.length} tracks
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                    }}
                    className="rounded p-1.5 text-zinc-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    title="Delete playlist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Local Audio Files */}
      {tab === "local" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#181818] p-5">
            <div>
              <h3 className="text-base font-bold text-white">
                Local Music Storage
              </h3>
              <p className="text-xs text-zinc-400">
                Select .mp3, .flac, .wav, .ogg, or .m4a files from your Windows
                PC or Android device.
              </p>
            </div>
            <button
              onClick={importLocalTracks}
              className="inline-flex items-center gap-2 rounded-full bg-[#0EA5E9] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#0EA5E9]/25 hover:bg-[#0284C7]"
            >
              <FolderOpen className="h-4 w-4" />
              Add Audio Files
            </button>
          </div>

          {localTracks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-400">
              No local audio files loaded yet. Click "Add Audio Files" above to
              browse your storage.
            </div>
          ) : (
            <div className="rounded-xl bg-[#181818] p-2">
              {localTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={localTracks}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
