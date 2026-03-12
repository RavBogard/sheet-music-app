const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

const ADMIN_UID = '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3';

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfillOwnerId() {
    const snapshot = await db.collection('setlists').get();
    let updated = 0;
    let skipped = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data.ownerId) {
            batch.update(doc.ref, { ownerId: ADMIN_UID });
            batchCount++;
            updated++;

            // Firestore batch limit is 500
            if (batchCount >= 500) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} updates`);
                batch = db.batch();
                batchCount = 0;
            }
        } else {
            skipped++;
        }
    }

    // Commit remaining
    if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${batchCount} updates`);
    }

    console.log(`Done. Updated: ${updated}, Already had ownerId: ${skipped}, Total: ${snapshot.size}`);
}

backfillOwnerId().catch(e => {
    console.error("Error:", e.message);
    process.exit(1);
});
