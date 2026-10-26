import { parseView, serializeView } from "./urlState";
import type { ViewState } from "./types";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeUrl(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function currentSearch(): string {
  return window.location.search;
}

export function serverSearch(): string {
  return "";
}

/** Write the view into the query string and notify subscribers. */
export function replaceView(next: ViewState): void {
  const query = serializeView(next);
  const target = `${window.location.pathname}${query}`;
  if (`${window.location.pathname}${window.location.search}` !== target) {
    window.history.replaceState(null, "", target);
  }
  emit();
}

export function viewFromSearch(search: string): ViewState {
  return parseView(new URLSearchParams(search));
}
