// One-shot diagnostic for v60-09 UAT-1: is "Lechu Goldman" present in
// songs/* on production Firestore? Used to classify the picker-doesn't-show-it
// bug as code (listener didn't deliver) vs spec (upload route mirror missing).
//
// Moved scripts/diag-lechu-goldman.ts → scripts/diag/diag-lechu-goldman.ts during
// v60-11-01 to keep the diag directory tidy. Used 2026-05-13 to confirm the
// 134-doc gap between library_index (498) and songs/* (364) — root cause was
// v54-01-01 bootstrap's MIME filter excluding shortcuts. v60-11-01 closes the gap.

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'crcmusiccharts'
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

console.log('env: projectId=', projectId, 'clientEmail set?', !!clientEmail, 'privateKey set?', !!privateKey)

if (!clientEmail || !privateKey) {
    console.error('Missing admin SDK credentials in .env.local')
    process.exit(1)
}

if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}
const db = getFirestore()

async function main() {
    const targetId = '1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj'
    console.log(`\n--- DIRECT FETCH: library_index/${targetId} ---`)
    const libDoc = await db.collection('library_index').doc(targetId).get()
    console.log('exists?', libDoc.exists)
    if (libDoc.exists) console.log('data:', JSON.stringify(libDoc.data(), null, 2))

    console.log(`\n--- DIRECT FETCH: songs/${targetId} ---`)
    const songsDoc = await db.collection('songs').doc(targetId).get()
    console.log('exists?', songsDoc.exists)
    if (songsDoc.exists) console.log('data:', JSON.stringify(songsDoc.data(), null, 2))

    console.log('\n--- songs collection: title exact match "Lechu Goldman" ---')
    const exact = await db.collection('songs').where('title', '==', 'Lechu Goldman').get()
    console.log('matches:', exact.size)
    exact.docs.forEach((d) => console.log(' ', JSON.stringify({ id: d.id, ...d.data() })))

    console.log('\n--- songs collection: normalizedTitle prefix range "lechu" ---')
    const range = await db
        .collection('songs')
        .where('normalizedTitle', '>=', 'lechu')
        .where('normalizedTitle', '<', 'lechv')
        .limit(20)
        .get()
    console.log('matches:', range.size)
    range.docs.forEach((d) => {
        const data = d.data()
        console.log(' ', JSON.stringify({
            id: d.id,
            title: data.title,
            normalizedTitle: data.normalizedTitle,
            status: data.status,
            updatedAt: data.updatedAt,
        }))
    })

    console.log('\n--- library_index: title prefix "Lechu" ---')
    const lib = await db
        .collection('library_index')
        .where('title', '>=', 'Lechu')
        .where('title', '<', 'Lechv')
        .limit(20)
        .get()
    console.log('matches:', lib.size)
    lib.docs.forEach((d) => {
        const data = d.data()
        console.log(' ', JSON.stringify({
            id: d.id,
            title: data.title,
            displayName: data.displayName,
            status: data.status,
            modifiedTime: data.modifiedTime,
        }))
    })

    console.log('\n--- songs collection: top 10 most-recent by updatedAt ---')
    const recent = await db.collection('songs').orderBy('updatedAt', 'desc').limit(10).get()
    console.log('matches:', recent.size)
    recent.docs.forEach((d) => {
        const data = d.data()
        const updatedAtRaw = data.updatedAt
        let updatedAtStr = 'n/a'
        if (typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw)) {
            updatedAtStr = new Date(updatedAtRaw).toISOString()
        } else if (updatedAtRaw && typeof (updatedAtRaw as { toMillis?: () => number }).toMillis === 'function') {
            updatedAtStr = new Date((updatedAtRaw as { toMillis: () => number }).toMillis()).toISOString()
        }
        console.log(' ', JSON.stringify({
            id: d.id,
            title: data.title,
            normalizedTitle: data.normalizedTitle,
            status: data.status,
            updatedAt: updatedAtStr,
        }))
    })

    console.log('\n--- library_index: top 10 most-recent by modifiedTime ---')
    const recentLib = await db.collection('library_index').orderBy('modifiedTime', 'desc').limit(10).get()
    console.log('matches:', recentLib.size)
    recentLib.docs.forEach((d) => {
        const data = d.data()
        console.log(' ', JSON.stringify({
            id: d.id,
            title: data.title,
            displayName: data.displayName,
            status: data.status,
            modifiedTime: data.modifiedTime,
        }))
    })

    console.log('\n--- library_index: displayName range "Lechu" ---')
    const libDn = await db
        .collection('library_index')
        .where('displayName', '>=', 'Lechu')
        .where('displayName', '<', 'Lechv')
        .limit(20)
        .get()
    console.log('matches:', libDn.size)
    libDn.docs.forEach((d) => {
        const data = d.data()
        console.log(' ', JSON.stringify({
            id: d.id,
            title: data.title,
            displayName: data.displayName,
            status: data.status,
        }))
    })

    console.log('\n--- songs collection: count ---')
    const total = await db.collection('songs').count().get()
    console.log('total songs:', total.data().count)
    const totalLib = await db.collection('library_index').count().get()
    console.log('total library_index:', totalLib.data().count)
}

main().catch((err) => {
    console.error('ERR:', err.message)
    process.exit(1)
}).then(() => process.exit(0))
