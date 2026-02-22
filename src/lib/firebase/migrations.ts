import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

/**
 * Migration Function Signature
 * Every migration must return the number of documents modified or affected.
 */
export type MigrationFunction = () => Promise<number>

export interface MigrationDef {
    id: string
    description: string
    up: MigrationFunction
}

/**
 * Registry of all database migrations.
 * When adding a new migration, append it to this array.
 */
export const migrations: MigrationDef[] = [
    {
        id: "001_initial_schema_version",
        description: "Initial migration to stamp congregation config with schema version 1",
        up: async () => {
            initAdmin()
            const configRef = getFirestore().collection("config").doc("congregation")
            await configRef.set({ schemaVersion: 1 }, { merge: true })
            return 1
        }
    },
    // Add new migrations here over time:
    // {
    //     id: "002_add_user_preferences",
    //     description: "Add default preferences to all users",
    //     up: async () => { ... }
    // }
]

/**
 * Executes pending migrations in order.
 * Tracks applied migrations in `config/migrations` collection.
 */
export async function runPendingMigrations(): Promise<{ applied: string[], errors: string[] }> {
    initAdmin()
    const applied: string[] = []
    const errors: string[] = []

    const migrationDoc = getFirestore().collection("config").doc("migrations_state")
    const stateDoc = await migrationDoc.get()
    const appliedIds: string[] = stateDoc.exists ? stateDoc.data()?.appliedIds || [] : []

    for (const migration of migrations) {
        if (!appliedIds.includes(migration.id)) {
            try {
                logger.info(`[Migration] Running ${migration.id}...`)
                const count = await migration.up()
                logger.info(`[Migration] Success: ${migration.id} (${count} records modified)`)

                appliedIds.push(migration.id)
                applied.push(migration.id)

                // Save state after each successful migration to prevent re-running on partial failure
                await migrationDoc.set({ appliedIds, lastRun: new Date().toISOString() }, { merge: true })
            } catch (error: any) {
                logger.error(`[Migration] Failed: ${migration.id}`, error)
                errors.push(`${migration.id}: ${error.message}`)
                break // Stop on first failure
            }
        }
    }

    if (applied.length > 0) {
        logger.info(`[Migration] Successfully applied ${applied.length} migrations.`)
    } else {
        logger.info(`[Migration] No pending migrations to run. Database is up to date.`)
    }

    return { applied, errors }
}
