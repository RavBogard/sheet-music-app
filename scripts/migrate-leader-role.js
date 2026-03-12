const admin = require('firebase-admin');

/**
 * One-time migration: Update any Firestore users with role "leader" to "band_leader"
 * Also updates Firebase Auth custom claims to match.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json node scripts/migrate-leader-role.js
 *
 * Or if you have a default project configured:
 *   node scripts/migrate-leader-role.js
 */

// Initialize with default credentials (ADC or GOOGLE_APPLICATION_CREDENTIALS)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function migrate() {
    console.log('Querying users with role "leader"...');

    const snapshot = await db.collection('users').where('role', '==', 'leader').get();

    if (snapshot.empty) {
        console.log('No users found with role "leader". Nothing to migrate.');
        return;
    }

    console.log(`Found ${snapshot.size} user(s) with role "leader". Migrating...`);

    // Firestore batch limit is 500
    const batches = [];
    let currentBatch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        currentBatch.update(doc.ref, { role: 'band_leader' });
        batchCount++;

        if (batchCount === 500) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        batches.push(currentBatch);
    }

    // Commit all Firestore batches
    for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        console.log(`  Firestore batch ${i + 1}/${batches.length} committed.`);
    }

    // Update Auth custom claims for each migrated user
    let claimsUpdated = 0;
    let claimsFailed = 0;

    for (const doc of snapshot.docs) {
        const uid = doc.id;
        try {
            const user = await admin.auth().getUser(uid);
            const existingClaims = user.customClaims || {};
            await admin.auth().setCustomUserClaims(uid, {
                ...existingClaims,
                role: 'band_leader',
            });
            claimsUpdated++;
        } catch (err) {
            console.error(`  Failed to update claims for UID ${uid}: ${err.message}`);
            claimsFailed++;
        }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Firestore docs updated: ${snapshot.size}`);
    console.log(`  Auth claims updated: ${claimsUpdated}`);
    if (claimsFailed > 0) {
        console.log(`  Auth claims failed: ${claimsFailed} (check errors above)`);
    }
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
