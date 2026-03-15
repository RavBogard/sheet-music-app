const { initAdmin } = require('./src/lib/firebase-admin');
const { getStorage } = require('firebase-admin/storage');

async function test() {
    initAdmin();
    const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const [files] = await bucket.getFiles({ prefix: 'library/' });
    console.log("Files in storage:", files.map(f => f.name).slice(0, 5));
}

test().catch(console.error);
