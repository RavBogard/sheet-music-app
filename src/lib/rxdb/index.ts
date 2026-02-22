import { createRxDatabase, RxDatabase, addRxPlugin, removeRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import {
    setlistSchema, fileMetaSchema, settingsSchema, annotationsSchema,
    RxSetlistDocType, RxFileMetaDocType, RxSettingsDocType, RxAnnotationsDocType
} from './schemas';

// Optional: Enable dev mode in development
if (process.env.NODE_ENV !== 'production') {
    import('rxdb/plugins/dev-mode').then(module => {
        addRxPlugin(module.RxDBDevModePlugin);
    });
}

// Add necessary plugins
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
addRxPlugin(RxDBUpdatePlugin);

import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
addRxPlugin(RxDBQueryBuilderPlugin);

// Since we'll use attachments for Blob data in file storage
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
addRxPlugin(RxDBAttachmentsPlugin);

import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
addRxPlugin(RxDBMigrationSchemaPlugin);

export type MyDatabaseCollections = {
    setlists: import('rxdb').RxCollection<RxSetlistDocType>;
    files: import('rxdb').RxCollection<RxFileMetaDocType>;
    settings: import('rxdb').RxCollection<RxSettingsDocType>;
    annotations: import('rxdb').RxCollection<RxAnnotationsDocType>;
};

export type MyDatabase = RxDatabase<MyDatabaseCollections>;

let dbPromise: Promise<MyDatabase> | null = null;

export const initRxDB = async (): Promise<MyDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = (async () => {
        const db = await createRxDatabase<MyDatabaseCollections>({
            name: 'sheet-music-rxdb',
            storage: getRxStorageDexie(),
            multiInstance: true, // synchronize data between multiple tabs
        });

        try {
            await db.addCollections({
                setlists: {
                    schema: setlistSchema,
                },
                files: {
                    schema: fileMetaSchema,
                    migrationStrategies: {
                        // We simply drop the old cached file metadata (return null).
                        // The app will automatically re-fetch the file from Google Drive if needed.
                        1: () => null
                    }
                },
                settings: {
                    schema: settingsSchema,
                },
                annotations: {
                    schema: annotationsSchema,
                }
            });
        } catch (error: any) {
            console.error('RxDB initialization/migration failed. Wiping corrupted local DB and retrying...', error);
            try { await db.remove(); } catch (e) { /* ignore */ }
            await removeRxDatabase('sheet-music-rxdb', getRxStorageDexie());
            dbPromise = null;
            return initRxDB(); // Re-initialize with a completely fresh slate
        }

        return db;
    })();

    return dbPromise;
};

// Generic utility to wait for RxDB
export const getDB = () => initRxDB();
