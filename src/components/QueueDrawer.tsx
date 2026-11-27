import React from "react";
import { Trash2, X } from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { formatTime } from "../utils/formatTime";

export const QueueDrawer: React.FC = () => {
  const {
    isQueueOpen,
    setQueueOpen,
    currentTrack,
    queue,
    playTrack,
    removeFromQueue,
    clearQueue,
  } = usePlayer();

  if (!isQueueOpen) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#181818] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
        <h2 className="text-base font-bold text-white">Play Queue</h2>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setQueueOpen(false)}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {currentTrack && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Now Playing
            </p>
            <div className="flex items-center gap-3 rounded-lg bg-[#242424] p-2.5">
              <img
                src={currentTrack.albumArt}
                alt={currentTrack.album}
                className="h-11 w-11 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#0EA5E9]">
                  {currentTrack.title}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {currentTrack.artist}
                </p>
              </div>
              <span className="text-xs tabular-nums text-zinc-400">
                {formatTime(currentTrack.duration)}
              </span>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Up Next ({queue.length})
          </p>
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
              Your queue is empty. Add songs from Search or Home!
            </p>
          ) : (
            <div className="space-y-1">
              {queue.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  className="group flex items-center gap-3 rounded-lg p-2 hover:bg-[#242424]"
                >
                  <img
                    src={track.albumArt}
                    alt={track.album}
                    onClick={() => playTrack(track)}
                    className="h-10 w-10 cursor-pointer rounded object-cover"
                  />
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => playTrack(track)}
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {track.artist}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromQueue(idx)}
                    className="rounded p-1 text-zinc-500 hover:text-red-400"
                    title="Remove from queue"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
