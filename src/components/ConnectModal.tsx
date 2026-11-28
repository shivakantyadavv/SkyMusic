import React, { useEffect, useState } from "react";
import {
  Cast,
  CheckCircle2,
  Cloud,
  Laptop,
  Link2,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  Shield,
  SkipBack,
  SkipForward,
  Smartphone,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePlayer } from "../context/PlayerContext";
import { CastDeviceTarget, useSync } from "../context/SyncContext";
import { LanDeviceInfo } from "../types/music";
import { formatTime } from "../utils/formatTime";
import { useTvMode } from "../utils/tvNavigation";

function DevicePlatformIcon({
  platform,
  className = "h-5 w-5",
}: {
  platform: string;
  className?: string;
}) {
  if (platform === "tv") return <Tv className={className} />;
  if (platform === "mobile") return <Smartphone className={className} />;
  return <Laptop className={className} />;
}

export const ConnectModal: React.FC = () => {
  const tvMode = useTvMode();
  const { currentTrack, volume } = usePlayer();
  const {
    deviceName,
    setDeviceName,
    platform,
    lanPin,
    setLanPin,
    cloudUser,
    cloudLinkedEmail,
    isCloudConnected,
    cloudStatus,
    cloudError,
    lastCloudSyncAt,
    cloudDevices,
    signInCloud,
    signUpCloud,
    quickStartCloud,
    signOutCloud,
    syncCloudNow,
    tvPairSession,
    pairMessage,
    startTvPairSession,
    cancelTvPairSession,
    linkTvWithCode,
    lanSelfInfo,
    lanPeers,
    lanBusy,
    lanMessage,
    refreshLan,
    probeLanAddress,
    syncWithLanDevice,
    activeCastTarget,
    selectCastTarget,
    castCommand,
    handoffPlaybackTo,
    remoteContinueListening,
    resumeContinueListening,
    dismissContinueListening,
    isConnectOpen,
    connectTab,
    openConnectModal,
    closeConnectModal,
  } = useSync();

  const [manualIp, setManualIp] = useState("");
  const [pairCodeInput, setPairCodeInput] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState(deviceName);
  const [pinDraft, setPinDraft] = useState(lanPin);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [pairCountdown, setPairCountdown] = useState<number>(0);

  useEffect(() => {
    setNameDraft(deviceName);
    setPinDraft(lanPin);
  }, [deviceName, lanPin]);

  useEffect(() => {
    if (!tvPairSession) {
      setPairCountdown(0);
      return;
    }
    const tick = () => {
      const rem = Math.max(
        0,
        Math.floor((tvPairSession.expiresAt - Date.now()) / 1000)
      );
      setPairCountdown(rem);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [tvPairSession]);

  const toTargetFromLan = (peer: LanDeviceInfo): CastDeviceTarget => ({
    kind: "lan",
    deviceId: peer.deviceId,
    deviceName: peer.deviceName,
    platform:
      peer.platform === "tv" || peer.platform === "mobile"
        ? peer.platform
        : "desktop",
    ip: peer.ip,
    port: peer.port,
    nowPlaying: peer.nowPlaying ?? null,
  });

  const handleCastSong = async (target: CastDeviceTarget) => {
    setBusyAction(`cast-${target.deviceId}`);
    setFeedback(null);
    try {
      await handoffPlaybackTo(target, true);
      setFeedback({
        type: "ok",
        text: `Playing "${currentTrack?.title}" on ${target.deviceName}`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Cast failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleLanSync = async (peer: LanDeviceInfo) => {
    setBusyAction(`sync-${peer.deviceId}`);
    setFeedback(null);
    try {
      await syncWithLanDevice(peer);
      setFeedback({
        type: "ok",
        text: `Library & preferences synced over Wi-Fi with ${peer.deviceName}`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Wi-Fi sync failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleProbeIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp.trim()) return;
    setBusyAction("probe-ip");
    setFeedback(null);
    try {
      const [ipOnly, portStr] = manualIp.trim().split(":");
      const portNum = portStr ? Number(portStr) : undefined;
      const peer = await probeLanAddress(ipOnly, portNum);
      setManualIp("");
      setFeedback({
        type: "ok",
        text: `Found ${peer.deviceName} at ${peer.ip}:${peer.port}`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Could not reach IP.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloudAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("auth");
    setFeedback(null);
    try {
      if (authMode === "signin") {
        await signInCloud(email, password);
        setFeedback({ type: "ok", text: "Signed in & syncing with Cloud!" });
      } else {
        await signUpCloud(email, password, displayName);
        setFeedback({
          type: "ok",
          text: "Sync account created! Sign in on your Phone/PC or pair your TV.",
        });
      }
      setPassword("");
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Authentication failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePairTvCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairCodeInput.trim()) return;
    setBusyAction("link-code");
    setFeedback(null);
    try {
      const tvName = await linkTvWithCode(pairCodeInput);
      setPairCodeInput("");
      setFeedback({
        type: "ok",
        text: `${tvName} is now linked and syncing your library!`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Pairing failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoteAction = async (
    action: "toggle" | "next" | "prev" | "set_volume",
    extra?: { volume?: number }
  ) => {
    if (!activeCastTarget) return;
    try {
      await castCommand(activeCastTarget, action, extra);
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Remote control failed.",
      });
    }
  };

  // Deduplicate Cloud devices against discovered LAN peers
  const lanDeviceIds = new Set(lanPeers.map((p) => p.deviceId));
  const cloudOnlyDevices = cloudDevices.filter(
    (d) => !lanDeviceIds.has(d.deviceId)
  );

  return (
    <div
      data-tv-scope="connect"
      data-open={isConnectOpen ? "true" : "false"}
      aria-hidden={!isConnectOpen}
      style={{ visibility: isConnectOpen ? "visible" : "hidden" }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 transition-opacity duration-200 ${
        isConnectOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={closeConnectModal}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      {/* Dialog Card */}
      <div
        className={`sky-card relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-2xl ${
          tvMode ? "max-w-3xl" : "max-w-2xl"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0EA5E9] to-[#1DB954] text-white shadow">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Connect, Sync &amp; Cast to TV
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {deviceName} •{" "}
                {lanSelfInfo?.ip && lanSelfInfo.ip !== "127.0.0.1"
                  ? `Wi-Fi IP ${lanSelfInfo.ip}:${lanSelfInfo.port}`
                  : "Local Device"}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-tv-autofocus="true"
            onClick={closeConnectModal}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close Connect Dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 border-b border-[var(--border-subtle)] px-5 py-2.5">
          <button
            type="button"
            onClick={() => openConnectModal("devices")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition ${
              connectTab === "devices"
                ? "bg-[#0EA5E9] text-white shadow"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Wifi className="h-3.5 w-3.5" />
            Wi-Fi &amp; Cast Devices ({lanPeers.length + cloudOnlyDevices.length})
          </button>
          <button
            type="button"
            onClick={() => openConnectModal("cloud")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition ${
              connectTab === "cloud"
                ? "bg-[#1DB954] text-black shadow"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            Cloud Sync &amp; TV Pair Code
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                feedback.type === "ok"
                  ? "border-[#1DB954]/30 bg-[#1DB954]/15 text-[var(--accent-green)]"
                  : "border-red-500/30 bg-red-500/15 text-red-400"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Continue Listening Banner */}
          {remoteContinueListening?.track && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0EA5E9]/35 bg-[#0EA5E9]/10 p-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <img
                  src={remoteContinueListening.track.albumArt}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8]">
                    Continue from {remoteContinueListening.deviceName}
                  </p>
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                    {remoteContinueListening.track.title}
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {remoteContinueListening.track.artist} •{" "}
                    {formatTime(remoteContinueListening.position)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resumeContinueListening}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1DB954] px-3.5 py-1.5 text-xs font-bold text-black hover:bg-[#1ed760]"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Resume Here
                </button>
                <button
                  type="button"
                  onClick={dismissContinueListening}
                  className="rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-hover)]"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {connectTab === "devices" ? (
            <>
              {/* Active Remote Control Strip */}
              {activeCastTarget && (
                <div className="rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <DevicePlatformIcon
                        platform={activeCastTarget.platform}
                        className="h-5 w-5 text-[#1DB954]"
                      />
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">
                          Controlling {activeCastTarget.deviceName}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {activeCastTarget.nowPlaying
                            ? `${activeCastTarget.nowPlaying.title} — ${activeCastTarget.nowPlaying.artist}`
                            : "Connected for remote playback"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectCastTarget(null)}
                      className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Disconnect
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemoteAction("prev")}
                        className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] p-2 text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                        title="Previous track on remote"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoteAction("toggle")}
                        className="rounded-full bg-[#1DB954] p-2.5 text-black hover:bg-[#1ed760]"
                        title="Play / Pause remote"
                      >
                        {activeCastTarget.nowPlaying?.isPlaying ? (
                          <Pause className="h-4 w-4 fill-current" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoteAction("next")}
                        className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] p-2 text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                        title="Next track on remote"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Remote Vol
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        defaultValue={volume}
                        onChange={(e) =>
                          handleRemoteAction("set_volume", {
                            volume: Number(e.target.value),
                          })
                        }
                        className="sky-range w-24"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Option 3: Same Wi-Fi Discovered Peers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Same Wi-Fi Devices (Offline Direct)
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Sync songs or cast playback directly over Wi-Fi with zero internet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshLan}
                    disabled={lanBusy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)] disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${lanBusy ? "animate-spin" : ""}`}
                    />
                    Scan Wi-Fi
                  </button>
                </div>

                {lanPeers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 text-center">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      No other Skymusic apps detected on Wi-Fi yet. Make sure
                      Skymusic is open on your TV, Phone, or PC on the same router.
                    </p>
                    {lanSelfInfo?.ip && lanSelfInfo.ip !== "127.0.0.1" && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        This device address: <code className="font-mono">{lanSelfInfo.ip}:{lanSelfInfo.port}</code>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {lanPeers.map((peer) => {
                      const target = toTargetFromLan(peer);
                      const isControlling =
                        activeCastTarget?.deviceId === peer.deviceId;
                      return (
                        <div
                          key={peer.deviceId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3.5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0EA5E9]/15 text-[#38bdf8]">
                              <DevicePlatformIcon platform={peer.platform} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                                  {peer.deviceName}
                                </p>
                                <span className="rounded-full bg-[#1DB954]/20 px-2 py-0.5 text-[10px] font-bold text-[#1DB954]">
                                  Wi-Fi
                                </span>
                                {peer.requiresPin && (
                                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                    PIN
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-[var(--text-secondary)]">
                                {peer.ip}:{peer.port}
                                {peer.nowPlaying
                                  ? ` • ${peer.nowPlaying.title}`
                                  : " • Ready"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleLanSync(peer)}
                              disabled={busyAction === `sync-${peer.deviceId}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                            >
                              {busyAction === `sync-${peer.deviceId}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              Sync Library
                            </button>

                            {currentTrack && (
                              <button
                                type="button"
                                onClick={() => handleCastSong(target)}
                                disabled={
                                  busyAction === `cast-${peer.deviceId}`
                                }
                                className="inline-flex items-center gap-1.5 rounded-full bg-[#0EA5E9] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0284C7]"
                              >
                                <Cast className="h-3.5 w-3.5" />
                                Play Here
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                selectCastTarget(isControlling ? null : target)
                              }
                              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                                isControlling
                                  ? "bg-[#1DB954] text-black"
                                  : "border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              {isControlling ? "Remote Active" : "Remote"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {lanMessage && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {lanMessage}
                  </p>
                )}

                {/* Manual IP fallback (if router blocks UDP multicast/broadcast) */}
                <form
                  onSubmit={handleProbeIp}
                  className="flex flex-wrap items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="Manual Wi-Fi IP (e.g. 192.168.1.128)"
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#0EA5E9] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busyAction === "probe-ip" || !manualIp.trim()}
                    className="rounded-xl bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)] disabled:opacity-50"
                  >
                    {busyAction === "probe-ip" ? "Checking..." : "Connect IP"}
                  </button>
                </form>
              </div>

              {/* Cloud Room Remote Devices (works across different networks too!) */}
              {cloudOnlyDevices.length > 0 && (
                <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Online via Cloud Sync
                  </h3>
                  {cloudOnlyDevices.map((dev) => {
                    const target: CastDeviceTarget = {
                      kind: "cloud",
                      deviceId: dev.deviceId,
                      deviceName: dev.deviceName,
                      platform: dev.platform,
                      nowPlaying: dev.nowPlaying ?? null,
                    };
                    const isControlling =
                      activeCastTarget?.deviceId === dev.deviceId;
                    return (
                      <div
                        key={dev.deviceId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1DB954]/15 text-[#1DB954]">
                            <DevicePlatformIcon platform={dev.platform} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                              {dev.deviceName}
                            </p>
                            <p className="truncate text-xs text-[var(--text-secondary)]">
                              {dev.nowPlaying
                                ? `Cloud • ${dev.nowPlaying.title}`
                                : "Cloud Online"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentTrack && (
                            <button
                              type="button"
                              onClick={() => handleCastSong(target)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#1ed760]"
                            >
                              <Cast className="h-3.5 w-3.5" />
                              Play Here
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              selectCastTarget(isControlling ? null : target)
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                              isControlling
                                ? "bg-[#0EA5E9] text-white"
                                : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                            }`}
                          >
                            {isControlling ? "Remote Active" : "Remote"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* TAB 2: Option 1 Cloud Sync & TV Pair Code */
            <div className="space-y-5">
              {/* Cloud Status Box */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isCloudConnected
                            ? "bg-[#1DB954]"
                            : "bg-[var(--text-muted)]"
                        }`}
                      />
                      <p className="text-sm font-bold text-[var(--text-primary)]">
                        {isCloudConnected
                          ? `Synced (${cloudLinkedEmail || "Cloud Room"})`
                          : cloudUser && !cloudUser.isAnonymous
                          ? `Signed in (${cloudUser.email || "Account"}) — Sync Pending`
                          : "Cloud Sync Not Linked"}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {isCloudConnected
                        ? `Likes, playlists, recent plays, theme & Atmos sync in real time.${
                            lastCloudSyncAt
                              ? ` Last updated ${new Date(
                                  lastCloudSyncAt
                                ).toLocaleTimeString()}`
                              : ""
                          }`
                        : cloudUser && !cloudUser.isAnonymous
                        ? "Click Sync Now below to finish connecting your cloud library."
                        : "Sign in on Windows/Phone or show a 6-digit Pair Code on TV."}
                    </p>
                    {cloudError && (
                      <p className="mt-1 text-xs text-red-400">{cloudError}</p>
                    )}
                  </div>

                  {(isCloudConnected || (cloudUser && !cloudUser.isAnonymous)) && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => syncCloudNow().catch(() => {})}
                        disabled={cloudStatus === "syncing"}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0EA5E9] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0284C7]"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            cloudStatus === "syncing" ? "animate-spin" : ""
                          }`}
                        />
                        {isCloudConnected ? "Sync Now" : "Retry Sync"}
                      </button>
                      <button
                        type="button"
                        onClick={signOutCloud}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-red-400"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* TV Pair Code Generator (ideal on TV, available anywhere) */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <QrCode className="h-5 w-5 text-[#38bdf8]" />
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        {platform === "tv"
                          ? "Link This TV with Phone / PC"
                          : "Pair via 6-Digit TV Code"}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {platform === "tv"
                          ? "Generate a code here and enter it on your phone or Windows app — no typing password on TV remote."
                          : "Show a 6-digit pair code to link from another device, or enter your TV's code below."}
                      </p>
                    </div>
                  </div>
                  {!tvPairSession ? (
                    <button
                      type="button"
                      onClick={() => startTvPairSession().catch(() => {})}
                      className="rounded-full bg-[#0EA5E9] px-4 py-2 text-xs font-bold text-white hover:bg-[#0284C7]"
                    >
                      Show 6-Digit Code
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={cancelTvPairSession}
                      className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      Cancel Code
                    </button>
                  )}
                </div>

                {tvPairSession && (
                  <div className="flex flex-wrap items-center justify-center gap-6 rounded-xl border border-[#0EA5E9]/30 bg-black/25 p-5">
                    <div className="rounded-xl bg-white p-2.5 shadow">
                      <QRCodeSVG value={tvPairSession.code} size={112} />
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[#38bdf8]">
                        Enter This Code on Phone / PC
                      </p>
                      <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.2em] text-[var(--text-primary)]">
                        {tvPairSession.code.slice(0, 3)}{" "}
                        {tvPairSession.code.slice(3)}
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                        Waiting for approval • Expires in{" "}
                        {Math.floor(pairCountdown / 60)}:
                        {String(pairCountdown % 60).padStart(2, "0")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Link an existing TV by entering its 6-digit code */}
                <form
                  onSubmit={handlePairTvCode}
                  className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3"
                >
                  <Link2 className="h-4 w-4 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={7}
                    value={pairCodeInput}
                    onChange={(e) => setPairCodeInput(e.target.value)}
                    placeholder="Enter 6-digit TV code (e.g. 482910)"
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DB954] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={
                      busyAction === "link-code" ||
                      pairCodeInput.replace(/\D/g, "").length !== 6
                    }
                    className="rounded-xl bg-[#1DB954] px-4 py-2 text-xs font-bold text-black hover:bg-[#1ed760] disabled:opacity-50"
                  >
                    {busyAction === "link-code" ? "Linking..." : "Pair TV"}
                  </button>
                </form>

                {pairMessage && (
                  <p className="text-xs font-medium text-[#38bdf8]">
                    {pairMessage}
                  </p>
                )}
              </div>

              {/* Account Login / Sign Up (best for Phone & Windows Desktop!) */}
              {(!cloudUser || cloudUser.isAnonymous) && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        Skymusic Sync Account
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Sign in on Windows &amp; Android APK with the same email to keep your library forever.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => quickStartCloud().catch(() => {})}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle-hover)]"
                    >
                      1-Tap Quick Sync
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode("signin")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        authMode === "signin"
                          ? "bg-[#0EA5E9] text-white"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        authMode === "signup"
                          ? "bg-[#0EA5E9] text-white"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  <form onSubmit={handleCloudAuthSubmit} className="space-y-2.5">
                    {authMode === "signup" && (
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name (optional)"
                        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#0EA5E9] focus:outline-none"
                      />
                    )}
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#0EA5E9] focus:outline-none"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min 6 characters)"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#0EA5E9] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busyAction === "auth"}
                      className="w-full rounded-xl bg-[#1DB954] py-2.5 text-xs font-bold text-black hover:bg-[#1ed760] disabled:opacity-50"
                    >
                      {busyAction === "auth"
                        ? "Connecting..."
                        : authMode === "signin"
                        ? "Sign In & Sync Library"
                        : "Create Sync Account"}
                    </button>
                  </form>
                </div>
              )}

              {/* Device Identity & Optional LAN PIN */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#0EA5E9]" />
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">
                    Device Name &amp; Wi-Fi Security
                  </h4>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                      Device Name (shown to other devices)
                    </label>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => setDeviceName(nameDraft)}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#0EA5E9] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                      Optional Wi-Fi Sync PIN (leave blank on home Wi-Fi)
                    </label>
                    <input
                      type="password"
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value)}
                      onBlur={() => setLanPin(pinDraft)}
                      placeholder="Open on home Wi-Fi"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#0EA5E9] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
