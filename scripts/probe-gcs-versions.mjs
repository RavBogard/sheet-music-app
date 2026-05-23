#!/usr/bin/env node
/**
 * Track A2 prereq — GCS Object Versioning probe for 4 vanished bare-UUID fileIds.
 * Tier-0 READ-ONLY. No writes anywhere.
 *
 * For each fileId, lists all generations (current + non-current) of
 * library/<fileId>.pdf in the chart bucket and reports per-version metadata
 * (generation, timeCreated, timeDeleted, size, md5Hash). Output:
 *   - JSON dump to stdout for downstream consumption
 *   - human-readable per-row summary to stderr
 *
 * Usage:
 *   node scripts/probe-gcs-versions.mjs
 *
 * Requires .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY +
 * FIREBASE_STORAGE_BUCKET, OR GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.
 * Prefers the firebase-adminsdk SA (natural storage admin perms on
 * crcmusiccharts project); falls back to music-app-reader on permission denied.
 */
import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Minimal .env.local loader (avoid pulling dotenv from node_modules in case the
// junctioned modules path has the wrong entry).
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  // Defer-loaded literal \n in private keys → real newlines
  val = val.replace(/\\n/g, '\n');
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}

const FILE_IDS = [
  { id: '6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc', title: 'Eili Eili (Zahavi)' },
  { id: 'ae83649a-718d-4fc4-ace8-82a9f6c2a400', title: 'Shiru Ladonai (Neimark-Gumer)' },
  { id: '72a7aa6a-7b08-4c78-862c-197bbffb9515', title: 'Adon Olam (Folk)' },
  { id: 'c9efe661-9eb8-42fc-89d5-13f026629dc7', title: 'Adon Olam (Hitman-Ben-Hur)/medley' },
];

const BUCKET_NAME = (process.env.FIREBASE_STORAGE_BUCKET || 'crcmusiccharts.firebasestorage.app').replace(/^gs:\/\//, '');

function buildStorage(saChoice) {
  if (saChoice === 'firebase-admin') {
    return new Storage({
      projectId: 'crcmusiccharts',
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY,
      },
    });
  }
  if (saChoice === 'music-app-reader') {
    return new Storage({
      projectId: 'crcmusiccharts',
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY,
      },
    });
  }
  throw new Error(`Unknown SA choice: ${saChoice}`);
}

async function probeWithSa(saChoice) {
  process.stderr.write(`\n=== Probing with SA: ${saChoice} ===\n`);
  process.stderr.write(`Bucket: ${BUCKET_NAME}\n`);

  const storage = buildStorage(saChoice);
  const bucket = storage.bucket(BUCKET_NAME);

  // Sanity probe: can the SA list bucket metadata at all?
  try {
    const [bucketMeta] = await bucket.getMetadata();
    process.stderr.write(`Bucket exists; location=${bucketMeta.location}, versioning=${JSON.stringify(bucketMeta.versioning)}\n`);
  } catch (err) {
    process.stderr.write(`! Bucket metadata fetch failed: ${err.message}\n`);
    throw err;
  }

  const results = [];

  for (const row of FILE_IDS) {
    const objectName = `library/${row.id}.pdf`;
    process.stderr.write(`\n--- ${row.title}\n    object: ${objectName}\n`);

    try {
      const [files] = await bucket.getFiles({
        prefix: objectName,
        versions: true,
        autoPaginate: true,
      });

      const matchingFiles = files.filter((f) => f.name === objectName);

      const versions = matchingFiles
        .map((f) => ({
          generation: f.generation || f.metadata.generation,
          timeCreated: f.metadata.timeCreated,
          timeDeleted: f.metadata.timeDeleted ?? null,
          updated: f.metadata.updated,
          size: f.metadata.size,
          md5Hash: f.metadata.md5Hash,
          crc32c: f.metadata.crc32c,
          contentType: f.metadata.contentType,
          isCurrent: !f.metadata.timeDeleted,
        }))
        .sort((a, b) => {
          // Most-recent-first
          const ta = a.timeCreated ? Date.parse(a.timeCreated) : 0;
          const tb = b.timeCreated ? Date.parse(b.timeCreated) : 0;
          return tb - ta;
        });

      results.push({
        ok: true,
        sa: saChoice,
        fileId: row.id,
        title: row.title,
        objectName,
        versionCount: versions.length,
        currentExists: versions.some((v) => v.isCurrent),
        versions,
      });

      process.stderr.write(`    versions: ${versions.length} (currentExists=${versions.some((v) => v.isCurrent)})\n`);
      for (const v of versions) {
        process.stderr.write(
          `      gen=${v.generation} created=${v.timeCreated} deleted=${v.timeDeleted || '-'} size=${v.size} md5=${v.md5Hash} current=${v.isCurrent}\n`
        );
      }
    } catch (err) {
      results.push({
        ok: false,
        sa: saChoice,
        fileId: row.id,
        title: row.title,
        objectName,
        error: { code: err.code, message: err.message, errors: err.errors },
      });
      process.stderr.write(`    ERROR: ${err.code} ${err.message}\n`);
    }
  }

  return results;
}

async function main() {
  let results;
  let sa = 'firebase-admin';
  try {
    results = await probeWithSa(sa);
  } catch (err) {
    process.stderr.write(`\n!! firebase-admin SA failed at bucket level: ${err.message}\n`);
    process.stderr.write(`!! Falling back to music-app-reader\n`);
    sa = 'music-app-reader';
    results = await probeWithSa(sa);
  }

  // If individual rows failed with permission denied on the first SA, retry just those rows on the second.
  const permDenied = results.filter((r) => !r.ok && /permission|denied|forbidden/i.test(r.error?.message || ''));
  if (sa === 'firebase-admin' && permDenied.length > 0) {
    process.stderr.write(`\n!! ${permDenied.length} rows perm-denied on firebase-admin; retrying those on music-app-reader\n`);
    const retried = await probeWithSa('music-app-reader');
    // Merge: prefer non-error rows from retry where original was perm-denied
    const retriedById = Object.fromEntries(retried.map((r) => [r.fileId, r]));
    results = results.map((r) =>
      permDenied.some((p) => p.fileId === r.fileId) && retriedById[r.fileId]?.ok ? retriedById[r.fileId] : r
    );
  }

  const summary = {
    probedAt: new Date().toISOString(),
    bucket: BUCKET_NAME,
    rows: results,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`\nFATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
