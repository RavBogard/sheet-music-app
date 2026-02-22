import { initAdmin, getFirestore } from "./src/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";

async function run() {
    initAdmin();
    // Usually the bucket name is the project id + .firebasestorage.app
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "crcmusiccharts.appspot.com";
    // Wait, let's just use getStorage().bucket() without args if it's default
    const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);

    console.log(`Checking bucket...`);
    const [files] = await bucket.getFiles({ prefix: "library/upload" });
    console.log(`Found ${files.length} upload files.`);
    files.slice(0, 10).forEach(f => console.log(f.name));

    const [mkimiFiles] = await bucket.getFiles({ prefix: "library/upload_60a5" });
    console.log("\nM'kimi explicit underscore check:");
    mkimiFiles.forEach(f => console.log(f.name));

    const [mkimiHyphenFiles] = await bucket.getFiles({ prefix: "library/upload-60a5" });
    console.log("\nM'kimi explicit hyphen check:");
    mkimiHyphenFiles.forEach(f => console.log(f.name));
}

run().catch(console.error);
