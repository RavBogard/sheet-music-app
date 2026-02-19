import { openDB, DBSchema } from 'idb';
import { Setlist } from './setlist-firebase';

interface OfflineDB extends DBSchema {
    files: {
        key: string;
        value: {
            id: string;
            blob: Blob;
            name: string;
            mimeType: string;
            updatedAt: number;
            lastAccessedAt: number;
        };
    };
    setlists: {
        key: string;
        value: Setlist;
    };
    settings: {
        key: string;
        value: unknown;
    };
}

const DB_NAME = 'sheet-music-offline-db';
const DB_VERSION = 2;

export const initDB = async () => {
    return openDB<OfflineDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('setlists')) {
                db.createObjectStore('setlists', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        },
    });
};

export const saveOfflineFile = async (id: string, blob: Blob, name: string, mimeType: string) => {
    const db = await initDB();
    try {
        await db.put('files', {
            id,
            blob,
            name,
            mimeType,
            updatedAt: Date.now(),
            lastAccessedAt: Date.now(),
        });
    } catch (err: unknown) {
        // On QuotaExceededError, evict stale files and retry once
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            const evicted = await evictStaleFiles(14); // Evict files not accessed in 14 days
            if (evicted > 0) {
                // Retry after eviction
                await db.put('files', {
                    id,
                    blob,
                    name,
                    mimeType,
                    updatedAt: Date.now(),
                    lastAccessedAt: Date.now(),
                });
                return;
            }
        }
        throw err; // Re-throw if not quota or eviction didn't help
    }
};

export const getOfflineFile = async (id: string) => {
    const db = await initDB();
    const file = await db.get('files', id);
    // Touch lastAccessedAt on read (fire-and-forget)
    if (file) {
        db.put('files', { ...file, lastAccessedAt: Date.now() }).catch(() => {});
    }
    return file;
};

export const deleteOfflineFile = async (id: string) => {
    const db = await initDB();
    await db.delete('files', id);
};

export const saveOfflineSetlist = async (setlist: Setlist) => {
    const db = await initDB();
    await db.put('setlists', setlist);
};

export const getOfflineSetlists = async () => {
    const db = await initDB();
    return db.getAll('setlists');
};

export const isFileOffline = async (id: string) => {
    const db = await initDB();
    const result = await db.getKey('files', id);
    return !!result;
};

/**
 * Evict offline files not accessed in the given number of days.
 * Returns the count of evicted files.
 */
export const evictStaleFiles = async (maxAgeDays = 60): Promise<number> => {
    const db = await initDB();
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const all = await db.getAll('files');
    let evicted = 0;

    for (const file of all) {
        const lastAccess = file.lastAccessedAt || file.updatedAt || 0;
        if (lastAccess < cutoff) {
            await db.delete('files', file.id);
            evicted++;
        }
    }

    return evicted;
};
