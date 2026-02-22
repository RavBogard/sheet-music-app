import { createRxDatabase, RxDatabase, addRxPlugin } from 'rxdb';
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

        await db.addCollections({
            setlists: {
                schema: setlistSchema,
            },
            files: {
                schema: fileMetaSchema,
            },
            settings: {
                schema: settingsSchema,
            },
            annotations: {
                schema: annotationsSchema,
            }
        });

        return db;
    })();

    return dbPromise;
};

// Generic utility to wait for RxDB
export const getDB = () => initRxDB();
