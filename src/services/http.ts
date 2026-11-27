import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function smartFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  if (isTauriEnv()) {
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
