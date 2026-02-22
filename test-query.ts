import { loadEnvConfig } from '@next/env'
import { initAdmin, getFirestore } from "./src/lib/firebase-admin";

loadEnvConfig(process.cwd())

async function run() {
    initAdmin();
    const db = getFirestore();
    const snapshot = await db.collection("library_index").get();

    console.log(`Found ${snapshot.size} total docs.`);
    snapshot.forEach(doc => {
        const name = doc.data().name || "";
        if (name.toLowerCase().includes("tu bishvat")) {
            console.log(`ID: ${doc.id}`);
            console.log(`Data:`, doc.data());
        }
    });
}

run().catch(console.error);
