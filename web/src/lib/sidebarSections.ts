/**
 * Which sidebar sections are open. Every section starts closed; a viewer's
 * choice is kept in localStorage so a reload opens the same ones. Memory is
 * the source of truth, so the sections still open and close when storage is
 * blocked (a private window, cleared site data): they just are not remembered.
 */
export const SECTIONS_KEY = "argus-cull.sidebar.open";

export type OpenSections = Readonly<Record<string, boolean>>;

const CLOSED: OpenSections = Object.freeze({});

/** Only `{ id: boolean }` pairs survive; anything else in storage is ignored. */
export function parseOpenSections(raw: string | null): OpenSections {
  if (!raw) return CLOSED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return CLOSED;
    const out: Record<string, boolean> = {};
    for (const [id, open] of Object.entries(parsed)) if (typeof open === "boolean") out[id] = open;
    return out;
  } catch {
    return CLOSED;
  }
}

export interface SectionStore {
  subscribe(listener: () => void): () => void;
  snapshot(): OpenSections;
  set(id: string, open: boolean): void;
}

/** A store over *storage* (window.localStorage in the page), read once on first use. */
export function sectionStore(storage: () => Pick<Storage, "getItem" | "setItem"> | null): SectionStore {
  let state: OpenSections | null = null;
  const listeners = new Set<() => void>();
  const load = (): OpenSections => {
    if (state) return state;
    try {
      state = parseOpenSections(storage()?.getItem(SECTIONS_KEY) ?? null);
    } catch {
      state = CLOSED;
    }
    return state;
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: load,
    set(id, open) {
      const current = load();
      if ((current[id] ?? false) === open) return;
      state = { ...current, [id]: open };
      try {
        storage()?.setItem(SECTIONS_KEY, JSON.stringify(state));
      } catch {
        // Not remembered; the section still opens.
      }
      for (const listener of listeners) listener();
    },
  };
}

export const CLOSED_SECTIONS = CLOSED;

/** The page's store: localStorage when the browser lets the page use it. */
export const sidebarSections = sectionStore(() => (typeof window === "undefined" ? null : window.localStorage));
