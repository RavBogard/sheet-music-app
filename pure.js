const admin = require('firebase-admin');
const dotenv = require('dotenv');
const env = dotenv.parse(require('fs').readFileSync('.env.local'));

admin.initializeApp({
  credential: admin.credential.cert({
    project_id: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    client_email: env.FIREBASE_CLIENT_EMAIL,
    private_key: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

admin.firestore().collection('library_index').doc('upload-a06055c4-c67b-4f7c-8d1b-de4cc0082915').get()
.then(doc => {
    console.log('DOC EXISTS:', doc.exists);
    if(doc.exists) console.log('DOC DATA:', doc.data());
    const b = admin.storage().bucket(env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID + '.firebasestorage.app');
    return b.getFiles({ prefix: 'library/upload-' });
})
.then(([files]) => {
    console.log('STORAGE FILES COUNT:', files.length);
    const target = files.find(f => f.name.includes('a06055c4'));
    if (target) {
        console.log('TARGET FOUND IN STORAGE:', target.name, target.metadata.contentType);
    } else {
        console.log('TARGET NOT FOUND IN STORAGE.');
        console.log('Recent 5 files:', files.slice(0, 5).map(f => f.name));
    }
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
