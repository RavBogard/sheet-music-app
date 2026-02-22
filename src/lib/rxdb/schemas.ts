import { ExtractDocumentTypeFromTypedRxJsonSchema, RxJsonSchema, toTypedRxJsonSchema } from 'rxdb';

// RxDB requires strictly defined JSON schemas for its collections.
// We map our existing `Setlist` and `DriveFile` models to these schemas.

const setlistSchemaLiteral = {
    title: 'setlist schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
        date: { type: 'string' }, // Firebase Timestamp converted to ISO string
        eventDate: { type: 'string' },
        updatedAt: { type: 'string' },
        tracks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    fileId: { type: 'string' },
                    fileName: { type: 'string' },
                    audioFileId: { type: 'string' },
                    audioFileName: { type: 'string' },
                    key: { type: 'string' },
                    notes: { type: 'string' },
                    referenceLink: { type: 'string' },
                    type: { type: 'string' },
                    duration: { type: 'string' },
                    bpm: { type: 'number' },
                    leadMusician: { type: 'string' },
                    transposition: { type: 'number' },
                    description: { type: 'string' },
                    performer: { type: 'string' },
                    estimatedMinutes: { type: 'number' }
                }
            }
        },
        trackCount: { type: 'number' },
        isPublic: { type: 'boolean' },
        ownerId: { type: 'string' },
        ownerName: { type: 'string' },
        rabbi: { type: 'string' },
        serviceNotes: { type: 'string' },
        musicians: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    uid: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    instrument: { type: 'string' }
                }
            }
        },
        isTemplate: { type: 'boolean' },
        templateType: { type: 'string' },
        transferredAt: { type: 'string' },
        previousOwnerId: { type: 'string' }
    },
    required: ['id', 'name', 'tracks', 'trackCount']
} as const;

export const setlistSchemaTyped = toTypedRxJsonSchema(setlistSchemaLiteral);
export type RxSetlistDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof setlistSchemaTyped>;
export const setlistSchema: RxJsonSchema<RxSetlistDocType> = setlistSchemaLiteral;


const fileMetaSchemaLiteral = {
    title: 'file meta schema',
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
        mimeType: { type: 'string' },
        updatedAt: { type: 'number' },
        lastAccessedAt: { type: 'number' }
    },
    required: ['id', 'name', 'mimeType'],
    indexes: ['lastAccessedAt', 'updatedAt']
} as const;

export const fileMetaSchemaTyped = toTypedRxJsonSchema(fileMetaSchemaLiteral);
export type RxFileMetaDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof fileMetaSchemaTyped>;
// Note: Actual BLOBs are stored as RxDB Attachments on this document.
export const fileMetaSchema: RxJsonSchema<RxFileMetaDocType> = fileMetaSchemaLiteral;


const settingsSchemaLiteral = {
    title: 'settings schema',
    version: 0,
    primaryKey: 'key',
    type: 'object',
    properties: {
        key: { type: 'string', maxLength: 100 },
        value: { type: 'object' } // Any JSON
    },
    required: ['key', 'value']
} as const;

export const settingsSchemaTyped = toTypedRxJsonSchema(settingsSchemaLiteral);
export type RxSettingsDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof settingsSchemaTyped>;
export const settingsSchema: RxJsonSchema<RxSettingsDocType> = settingsSchemaLiteral;


const annotationsSchemaLiteral = {
    title: 'annotations schema',
    version: 0,
    primaryKey: 'key',
    type: 'object',
    properties: {
        key: { type: 'string', maxLength: 100 },
        uid: { type: 'string' },
        fileId: { type: 'string' },
        pageAnnotations: { type: 'object' },
        updatedAt: { type: 'number' }
    },
    required: ['key', 'uid', 'fileId', 'pageAnnotations']
} as const;

export const annotationsSchemaTyped = toTypedRxJsonSchema(annotationsSchemaLiteral);
export type RxAnnotationsDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof annotationsSchemaTyped>;
export const annotationsSchema: RxJsonSchema<RxAnnotationsDocType> = annotationsSchemaLiteral;

