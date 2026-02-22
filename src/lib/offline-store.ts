import { getDB } from './rxdb';
import { Setlist } from './setlist-firebase';

export const initDB = async () => {
    return getDB();
};

export const saveOfflineFile = async (id: string, blob: Blob, name: string, mimeType: string) => {
    const db = await getDB();
    try {
        const doc = await db.files.upsert({
            id,
            name,
            mimeType,
            updatedAt: Date.now(),
            lastAccessedAt: Date.now(),
        });
        await doc.putAttachment({
            id: 'blob',
            data: blob,
            type: mimeType
        });
    } catch (err: unknown) {
        // On QuotaExceededError, evict stale files and retry once
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            const evicted = await evictStaleFiles(14); // Evict files not accessed in 14 days
            if (evicted > 0) {
                const docRetry = await db.files.upsert({
                    id,
                    name,
                    mimeType,
                    updatedAt: Date.now(),
                    lastAccessedAt: Date.now(),
                });
                await docRetry.putAttachment({
                    id: 'blob',
                    data: blob,
                    type: mimeType
                });
                return;
            }
        }
        throw err;
    }
};

export const getOfflineFile = async (id: string) => {
    const db = await getDB();
    const doc = await db.files.findOne({ selector: { id } }).exec();

    if (doc) {
        // Touch lastAccessedAt on read (fire-and-forget)
        doc.incrementalPatch({ lastAccessedAt: Date.now() }).catch(() => { });

        const attachment = doc.getAttachment('blob');
        if (attachment) {
            const blobData = await attachment.getData();
            return {
                id: doc.id,
                name: doc.name,
                mimeType: doc.mimeType,
                updatedAt: doc.updatedAt,
                lastAccessedAt: doc.lastAccessedAt,
                blob: blobData as Blob
            };
        }
    }
    return undefined;
};

export const deleteOfflineFile = async (id: string) => {
    const db = await getDB();
    const doc = await db.files.findOne({ selector: { id } }).exec();
    if (doc) {
        await doc.remove();
    }
};

export const saveOfflineSetlist = async (setlist: Setlist) => {
    const db = await getDB();
    const cleanSetlist = JSON.parse(JSON.stringify(setlist)); // Clear any undefined properties for JSONSchema
    await db.setlists.upsert(cleanSetlist);
};

export const getOfflineSetlists = async () => {
    const db = await getDB();
    const docs = await db.setlists.find().exec();
    return docs.map(d => d.toJSON()) as unknown as Setlist[];
};

export const isFileOffline = async (id: string) => {
    const db = await getDB();
    const doc = await db.files.findOne({ selector: { id } }).exec();
    return !!doc;
};

/**
 * Evict offline files not accessed in the given number of days.
 * Returns the count of evicted files.
 */
export const evictStaleFiles = async (maxAgeDays = 60): Promise<number> => {
    const db = await getDB();
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    const allFiles = await db.files.find().exec();
    let evicted = 0;

    for (const doc of allFiles) {
        const lastAccess = doc.lastAccessedAt || doc.updatedAt || 0;
        if (lastAccess < cutoff) {
            await doc.remove();
            evicted++;
        }
    }

    return evicted;
};

// --- Annotations Offline Queue ---
export const saveOfflineAnnotation = async (uid: string, fileId: string, pageAnnotations: any) => {
    const db = await getDB();
    const key = `${uid}_${fileId}`;
    await db.annotations.upsert({
        key,
        fileId,
        uid,
        pageAnnotations,
        updatedAt: Date.now(),
    });
};

export const getOfflineAnnotation = async (uid: string, fileId: string) => {
    const db = await getDB();
    const key = `${uid}_${fileId}`;
    const doc = await db.annotations.findOne({ selector: { key } }).exec();
    return doc ? doc.toJSON() : undefined;
};

export const getAllOfflineAnnotations = async () => {
    const db = await getDB();
    const docs = await db.annotations.find().exec();
    return docs.map(d => d.toJSON());
};

export const deleteOfflineAnnotation = async (uid: string, fileId: string) => {
    const db = await getDB();
    const key = `${uid}_${fileId}`;
    const doc = await db.annotations.findOne({ selector: { key } }).exec();
    if (doc) {
        await doc.remove();
    }
};
