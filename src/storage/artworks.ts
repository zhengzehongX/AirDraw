import type { MaterialPresetId, Stroke } from '../types/drawing';

/**
 * Artwork persistence.
 *
 * A saved piece is a complete picture of the work: the strokes themselves, the
 * brush and theme they were drawn with, the camera the user was looking through,
 * and a thumbnail so the gallery never has to re-render a scene to show a card.
 *
 * IndexedDB because a full canvas is megabytes of points and localStorage's
 * ~5 MB quota is shared with everything else the browser keeps for the origin.
 * If IndexedDB is unavailable (private mode, disabled storage) the same API keeps
 * working against memory for the session rather than failing silently.
 */

const DB_NAME = 'airdraw';
const DB_VERSION = 1;
const STORE = 'artworks';
const LEGACY_KEY = 'airdraw-work-v3';

export type Artwork = {
  mode?:'canvas'|'spatial';
  paper?:'white'|'transparent'|'dark';
  id: string;
  schema: 1;
  title: string;
  createdAt: number;
  updatedAt: number;
  theme: 'day' | 'night';
  camera: { yaw: number; pitch: number; distance: number };
  brush: { color: string; width: number; material: MaterialPresetId };
  strokeCount: number;
  pointCount: number;
  strokes: Stroke[];
  thumbnail: string | null;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Artwork>();
let usingMemory = false;

export function storageIsPersistent(): boolean {
  return !usingMemory;
}

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      usingMemory = true;
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      request.onsuccess = () => done(request.result);
      request.onerror = () => {
        usingMemory = true;
        done(null);
      };
      request.onblocked = () => {
        usingMemory = true;
        done(null);
      };
    } catch {
      usingMemory = true;
      done(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(STORE, mode);
          const request = run(transaction.objectStore(STORE));
          let result: T | null = null;
          request.onsuccess = () => { result = request.result as T; };
          transaction.oncomplete = () => resolve(result);
          transaction.onerror = transaction.onabort = () => resolve(null);
          request.onerror = () => resolve(null);
        } catch {
          usingMemory = true;
          resolve(null);
        }
      }),
  );
}

const newId = () =>
  `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function makeArtwork(input: Omit<Artwork, 'id' | 'schema' | 'createdAt' | 'updatedAt'>): Artwork {
  const now = Date.now();
  return { id: newId(), schema: 1, createdAt: now, updatedAt: now, ...input };
}

export async function saveArtwork(artwork: Artwork): Promise<Artwork> {
  const record = { ...artwork, updatedAt: Date.now() };
  const stored = await tx('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
  if (stored === null) {
    usingMemory = true;
    memory.set(record.id, record);
  }
  return record;
}

export async function listArtworks(): Promise<Artwork[]> {
  const all = await tx<Artwork[]>('readonly', (store) => store.getAll() as IDBRequest<Artwork[]>);
  const merged = [...(all ?? []), ...memory.values()];
  const seen = new Set<string>();
  return merged
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getArtwork(id: string): Promise<Artwork | null> {
  const found = memory.get(id) ?? (await tx<Artwork>('readonly', (store) => store.get(id) as IDBRequest<Artwork>));
  return found ?? null;
}

export async function deleteArtwork(id: string): Promise<void> {
  memory.delete(id);
  await tx('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}

export async function duplicateArtwork(id: string): Promise<Artwork | null> {
  const source = await getArtwork(id);
  if (!source) return null;
  const { id: _old, createdAt: _created, updatedAt: _updated, ...body } = source;
  return saveArtwork(makeArtwork({ ...body, title: `${source.title} copy` }));
}

/** One-time move of the phase-3 localStorage blob into the real store. */
export async function migrateLegacySave(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const strokes = JSON.parse(raw) as Stroke[];
    if (!Array.isArray(strokes) || strokes.length === 0) return;
    await saveArtwork(
      makeArtwork({
        title: 'Saved before gallery',
        theme: 'night',
        camera: { yaw: 0, pitch: 0, distance: 13.5 },
        brush: { color: '#22d3ee', width: 10, material: 'candy' },
        strokeCount: strokes.length,
        pointCount: strokes.reduce((sum, stroke) => sum + stroke.segments.reduce((n, s) => n + s.length, 0), 0),
        strokes,
        thumbnail: null,
      }),
    );
    if (storageIsPersistent()) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* Nothing legacy, or nothing readable: either way there is nothing to move. */
  }
}

/** Snapshot the live canvas into a record, counting points as it goes. */
export function artworkOf(
  strokes: readonly Stroke[],
  brush: Artwork['brush'],
  meta: Pick<Artwork, 'title' | 'theme' | 'camera' | 'thumbnail'>,
): Artwork {
  return makeArtwork({
    ...meta,
    brush,
    strokes: strokes.map((stroke) => ({ ...stroke })),
    strokeCount: strokes.length,
    pointCount: strokes.reduce((sum, stroke) => sum + stroke.segments.reduce((n, s) => n + s.length, 0), 0),
  });
}
