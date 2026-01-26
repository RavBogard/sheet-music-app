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
        };
    };
    setlists: {
        key: string;
        value: Setlist;
    };
    settings: {
        key: string;
        value: any;
    };
}

const DB_NAME = 'sheet-music-offline-db';
const DB_VERSION = 1;

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
    await db.put('files', {
        id,
        blob,
        name,
        mimeType,
        updatedAt: Date.now(),
    });
};

export const getOfflineFile = async (id: string) => {
    const db = await initDB();
    return db.get('files', id);
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
