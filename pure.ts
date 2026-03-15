import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env.local'));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

async function run() {
    try {
        const doc = await admin.firestore().collection('library_index').doc('upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915').get();
        console.log('DOC EXISTS:', doc.exists);
        if(doc.exists) console.log('DOC DATA:', doc.data());
        
        const bucketName = env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID + '.firebasestorage.app';
        const b = admin.storage().bucket(bucketName);
        const [files] = await b.getFiles({ prefix: 'library/upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915' });
        
        if (files.length > 0) {
            console.log('TARGET FOUND IN STORAGE:', files[0].name, files[0].metadata.contentType);
        } else {
            console.log('TARGET NOT FOUND IN STORAGE.');
        }
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
