const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json'); // User needs to place this file

// Check args
const email = process.argv[2];
const role = process.argv[3];

if (!email || !role) {
    console.error("Usage: node set-role.js <email> <role>");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function setRole() {
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.firestore().collection('users').doc(user.uid).set({
            role: role,
            email: email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Also set custom claims for faster access in rules
        await admin.auth().setCustomUserClaims(user.uid, { role });

        console.log(`Success! Set ${email} to role: ${role}`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

setRole();
