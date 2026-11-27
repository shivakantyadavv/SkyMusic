import React, { useEffect, useState } from "react";

export type TvModePreference = "auto" | "on" | "off";

const TV_PREF_KEY = "skymusic_tv_mode_pref";
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

type Direction = "up" | "down" | "left" | "right";

const backHandlers: Array<() => boolean> = [];

/** Registers a LIFO Android/TV Back button handler (returns true if consumed). */
export function registerBackHandler(handler: () => boolean): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.lastIndexOf(handler);
    if (idx >= 0) backHandlers.splice(idx, 1);
  };
}

/** Runs registered back handlers from newest to oldest. */
export function invokeBackHandlers(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      if (backHandlers[i]()) return true;
    } catch {
      // Ignore individual handler failures
    }
  }
  return false;
}

export function getTvModePreference(): TvModePreference {
  try {
    const raw = localStorage.getItem(TV_PREF_KEY);
    if (raw === "on" || raw === "off" || raw === "auto") return raw;
  } catch {
    // Ignore storage failures
  }
  return "auto";
}

export function isNativeAndroidTv(): boolean {
  try {
    if (window.SkymusicAndroid?.isTv?.()) return true;
    if (typeof window !== "undefined" && window.location.search.includes("tv=1")) {
      return true;
    }
  } catch {
    // Ignore bridge lookup errors
  }
  return false;
}

/** True when Skymusic should render TV 10-foot focus rings and spatial D-Pad nav. */
export function isTvMode(): boolean {
  const pref = getTvModePreference();
  if (pref === "on") return true;
  if (pref === "off") return false;
  return isNativeAndroidTv();
}

export function syncTvRootAttribute(): boolean {
  const active = isTvMode();
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-tv", active ? "true" : "false");
    window.dispatchEvent(new CustomEvent("skymusic-tv-mode-change", { detail: active }));
  }
  return active;
}

/** Reactive React hook returning whether TV 10-foot UI / D-Pad mode is active. */
export function useTvMode(): boolean {
  const [tv, setTv] = useState<boolean>(() => isTvMode());
  useEffect(() => {
    const sync = () => setTv(isTvMode());
    sync();
    window.addEventListener("skymusic-tv-mode-change", sync);
    return () => window.removeEventListener("skymusic-tv-mode-change", sync);
  }, []);
  return tv;
}

export function setTvModePreference(pref: TvModePreference): void {
  try {
    localStorage.setItem(TV_PREF_KEY, pref);
  } catch {
    // Ignore storage failures
  }
  syncTvRootAttribute();
}

export function hasTvVoiceSearch(): boolean {
  try {
    return Boolean(window.SkymusicAndroid?.hasVoiceSearch?.());
  } catch {
    return false;
  }
}

export function startTvVoiceSearch(): boolean {
  try {
    return Boolean(window.SkymusicAndroid?.startVoiceSearch?.());
  } catch {
    return false;
  }
}

/** Keyboard Enter/Space handler for clickable div cards on TV remotes. */
export function onTvCardKeyDown(
  e: React.KeyboardEvent,
  action: () => void
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    action();
  }
}

function getActiveScope(): HTMLElement {
  const scopes = ["update", "queue", "now-playing"];
  for (const name of scopes) {
    const el = document.querySelector<HTMLElement>(`[data-tv-scope="${name}"]`);
    if (el && el.getAttribute("data-open") !== "false" && !el.hasAttribute("inert")) {
      return el;
    }
  }
  return document.body;
}

function isElementVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled") || el.closest('[aria-hidden="true"], [inert], [data-open="false"]')) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

function getCandidates(scope: HTMLElement): HTMLElement[] {
  const all = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return all.filter(isElementVisible);
}

/** Focuses the preferred primary control inside a scope when it opens on TV. */
export function focusPrimaryInScope(scopeName?: string): void {
  if (!isTvMode()) return;
  const root = scopeName
    ? document.querySelector<HTMLElement>(`[data-tv-scope="${scopeName}"]`)
    : getActiveScope();
  if (!root) return;

  const preferred =
    root.querySelector<HTMLElement>('[data-tv-autofocus="true"]') ||
    getCandidates(root)[0];
  if (preferred) {
    preferred.focus({ preventScroll: true });
    preferred.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
}

function stepRangeInput(input: HTMLInputElement, deltaSign: 1 | -1): void {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const current = Number(input.value) || 0;
  const tvStepAttr = Number(input.getAttribute("data-tv-step"));
  const step =
    Number.isFinite(tvStepAttr) && tvStepAttr > 0
      ? tvStepAttr
      : Math.max(Number(input.step) || 1, (max - min) * 0.05);

  const next = Math.max(min, Math.min(max, current + deltaSign * step));
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, String(next));
  } else {
    input.value = String(next);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findBestCandidate(
  active: HTMLElement,
  candidates: HTMLElement[],
  dir: Direction
): HTMLElement | null {
  const a = active.getBoundingClientRect();
  const acx = (a.left + a.right) / 2;
  const acy = (a.top + a.bottom) / 2;
  const inSidebar = Boolean(active.closest("aside"));

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === active) continue;
    const b = el.getBoundingClientRect();
    const bcx = (b.left + b.right) / 2;
    const bcy = (b.top + b.bottom) / 2;

    const dx = bcx - acx;
    const dy = bcy - acy;

    let isValidDir = false;
    let primaryDist = 0;
    let perpDist = 0;
    let hasOverlap = false;

    if (dir === "right") {
      isValidDir = dx > 6 && b.left >= a.left + 2;
      if (isValidDir) {
        primaryDist = Math.max(0, b.left - a.right);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        hasOverlap = overlapY > 4;
        perpDist = Math.abs(dy);
      }
    } else if (dir === "left") {
      isValidDir = dx < -6 && b.right <= a.right - 2;
      if (isValidDir) {
        primaryDist = Math.max(0, a.left - b.right);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        hasOverlap = overlapY > 4;
        perpDist = Math.abs(dy);
      }
    } else if (dir === "down") {
      isValidDir = dy > 6 && b.top >= a.top + 2;
      if (isValidDir) {
        primaryDist = Math.max(0, b.top - a.bottom);
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        hasOverlap = overlapX > 4;
        perpDist = Math.abs(dx);
      }
    } else {
      isValidDir = dy < -6 && b.bottom <= a.bottom - 2;
      if (isValidDir) {
        primaryDist = Math.max(0, a.top - b.bottom);
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        hasOverlap = overlapX > 4;
        perpDist = Math.abs(dx);
      }
    }

    if (!isValidDir) continue;

    // Strongly prefer items aligned in the same row/column strip
    const perpWeight = hasOverlap ? 0.35 : 2.8;
    let score =
      (dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy)) +
      primaryDist * 0.4 +
      perpDist * perpWeight +
      (hasOverlap ? 0 : 120);

    // When stepping Left from main content into Sidebar, lightly prefer the active nav button
    if (
      dir === "left" &&
      !inSidebar &&
      el.closest("aside") &&
      el.getAttribute("data-active") === "true"
    ) {
      score -= 80;
    }

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

/** Installs spatial D-Pad arrow navigation & media key listeners for Android TV. */
export function installSpatialDpadNavigation(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    // Allow hardware media keys even outside explicit TV mode (useful on keyboards too)
    const mediaKeyMap: Record<string, string> = {
      MediaPlayPause: "play_pause",
      MediaPlay: "play",
      MediaPause: "pause",
      MediaTrackNext: "next",
      MediaTrackPrevious: "prev",
      MediaStop: "stop",
      MediaFastForward: "ff",
      MediaRewind: "rw",
    };
    const mappedMedia = mediaKeyMap[e.key];
    if (mappedMedia) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("skymusic-media-key", { detail: mappedMedia }));
      return;
    }

    if (!isTvMode()) return;

    const dirMap: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const dir = dirMap[e.key];
    const active = document.activeElement as HTMLElement | null;

    if (e.key === "Enter" || e.key === " ") {
      if (
        !e.defaultPrevented &&
        active &&
        active !== document.body &&
        active.tagName !== "BUTTON" &&
        active.tagName !== "A" &&
        active.tagName !== "INPUT" &&
        active.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        active.click();
      }
      return;
    }

    if (!dir) return;

    const scope = getActiveScope();
    const candidates = getCandidates(scope);
    if (candidates.length === 0) return;

    // Handle active text inputs without trapping user inside search box
    if (
      active instanceof HTMLInputElement &&
      (active.type === "text" || active.type === "search")
    ) {
      if (dir === "left" || dir === "right") {
        const atStart = active.selectionStart === 0 && active.selectionEnd === 0;
        const atEnd =
          active.selectionStart === active.value.length &&
          active.selectionEnd === active.value.length;
        if ((dir === "left" && !atStart) || (dir === "right" && !atEnd)) {
          return;
        }
      }
    }

    // Handle range sliders (seek & volume) smoothly on Left/Right D-Pad
    if (active instanceof HTMLInputElement && active.type === "range") {
      if (dir === "left" || dir === "right") {
        e.preventDefault();
        stepRangeInput(active, dir === "right" ? 1 : -1);
        return;
      }
    }

    e.preventDefault();

    if (!active || active === document.body || !scope.contains(active) || !isElementVisible(active)) {
      focusPrimaryInScope();
      return;
    }

    const next = findBestCandidate(active, candidates, dir);
    if (next) {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  };

  window.addEventListener("keydown", onKeyDown, true);

  // Initialize first focus on TV mount
  const initTimer = window.setTimeout(() => {
    if (isTvMode() && (!document.activeElement || document.activeElement === document.body)) {
      focusPrimaryInScope();
    }
  }, 450);

  return () => {
    window.clearTimeout(initTimer);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
