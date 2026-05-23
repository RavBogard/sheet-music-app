#!/usr/bin/env node
/**
 * Track A2 — restore vanished bare-UUID GCS chart objects from non-current
 * generations preserved by GCS Object Versioning.
 *
 * Tier-0 ops tool. Sibling of `scripts/probe-gcs-versions.mjs`. Reads the
 * generations from that probe's committed JSON output rather than hardcoding
 * them — the audit trail is: "this script restores exactly what the probe
 * inventoried, nothing else."
 *
 * DRY-RUN by default. `--apply` required for the real run.
 *
 * Idempotent: if the live object already exists with a md5 matching the
 * source generation, the row is SKIPped. If the live object exists with a
 * DIFFERENT md5, the script ABORTs (will not clobber an unrelated restore).
 *
 * Aborts on first verification failure (does not continue silently restoring
 * after a FAIL).
 *
 * Per row, with `--apply`:
 *   bucket.file(name, { generation }).copy(bucket.file(name))
 * Server-side copy; preserves md5Hash + crc32c (verified post-copy).
 *
 * Usage:
 *   node scripts/restore-gcs-versions.mjs           # DRY-RUN (default)
 *   node scripts/restore-gcs-versions.mjs --apply   # real run (Daniel only)
 *
 * Auth path identical to the probe — `.env.local` FIREBASE_CLIENT_EMAIL +
 * FIREBASE_PRIVATE_KEY for the `firebase-adminsdk-fbsvc@crcmusiccharts` SA.
 * The SA needs `storage.objects.create` (granted by default to the Firebase
 * Admin SDK SA); if `--apply` fails with permission errors, swap in a
 * bucket-admin SA via the same env vars.
 */
import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ENV_PATH = join(REPO_ROOT, '.env.local');
const PROBE_JSON_PATH = join(
  REPO_ROOT,
  '.paul',
  'research',
  'track-a2-resalvage',
  'gcs-version-probe-output.json'
);

const APPLY = process.argv.includes('--apply');

// --- env loader (mirrors probe-gcs-versions.mjs; avoids pulling dotenv) ---
{
  let envText;
  try {
    envText = readFileSync(ENV_PATH, 'utf8');
  } catch (err) {
    process.stderr.write(`!! Cannot read ${ENV_PATH}: ${err.message}\n`);
    process.stderr.write(
      `!! Run \`vercel env pull .env.local\` (from a Vercel-linked sibling worktree) or copy from sheet-music-app-mcp/.env.local.\n`
    );
    process.exit(1);
  }
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    val = val.replace(/\\n/g, '\n');
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

// --- inventory load (load-bearing — every claim derives from this file) ---
function loadInventory() {
  let raw;
  try {
    raw = readFileSync(PROBE_JSON_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read probe JSON at ${PROBE_JSON_PATH}: ${err.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Probe JSON is not valid JSON: ${err.message}`);
  }
  if (!json || typeof json !== 'object' || !Array.isArray(json.rows)) {
    throw new Error(
      `Probe JSON missing \`rows\` array (top-level keys: ${Object.keys(json || {}).join(', ') || '<none>'})`
    );
  }
  if (typeof json.bucket !== 'string' || !json.bucket) {
    throw new Error(`Probe JSON missing top-level \`bucket\` string`);
  }

  const items = [];
  for (const row of json.rows) {
    if (!row.ok) {
      throw new Error(
        `Probe JSON row ${row.fileId} has ok=false; refusing to restore from a partial probe`
      );
    }
    if (typeof row.objectName !== 'string' || !row.objectName) {
      throw new Error(`Probe JSON row ${row.fileId} missing objectName`);
    }
    if (!Array.isArray(row.versions) || row.versions.length === 0) {
      throw new Error(`Probe JSON row ${row.fileId} has no versions`);
    }
    // Restore source = the most-recent non-current version. Probe already
    // sorts most-recent-first, but we filter explicitly to make intent clear.
    const candidates = row.versions.filter((v) => v.isCurrent === false);
    if (candidates.length === 0) {
      throw new Error(
        `Probe JSON row ${row.fileId} has no non-current versions — nothing to restore from`
      );
    }
    const src = candidates[0];
    if (!src.generation || !src.md5Hash || !src.size) {
      throw new Error(
        `Probe JSON row ${row.fileId} source generation missing generation/md5Hash/size`
      );
    }
    items.push({
      fileId: row.fileId,
      title: row.title,
      objectName: row.objectName,
      sourceGeneration: String(src.generation),
      expectedMd5: src.md5Hash,
      expectedSize: String(src.size),
      sourceTimeCreated: src.timeCreated,
    });
  }
  return { bucket: json.bucket, items };
}

function buildStorage() {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      `FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY required in .env.local (firebase-adminsdk-fbsvc@crcmusiccharts SA)`
    );
  }
  return new Storage({
    projectId: 'crcmusiccharts',
    credentials: { client_email: email, private_key: key },
  });
}

function printSummary(report) {
  process.stderr.write(`\n=== Summary ===\n`);
  const counts = {};
  for (const r of report) counts[r.action] = (counts[r.action] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) {
    process.stderr.write(`  ${k}: ${v}\n`);
  }
  process.stdout.write(
    JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', report }, null, 2) + '\n'
  );
}

async function run() {
  const { bucket: bucketName, items } = loadInventory();
  const storage = buildStorage();
  const bucket = storage.bucket(bucketName);

  process.stderr.write(`\n=== Track A2 restore-gcs-versions ===\n`);
  process.stderr.write(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'}\n`);
  process.stderr.write(`Bucket: ${bucketName}\n`);
  process.stderr.write(`Inventory: ${items.length} row(s) from ${PROBE_JSON_PATH}\n`);

  const report = [];

  for (const item of items) {
    process.stderr.write(
      `\n--- ${item.title}\n` +
        `    fileId: ${item.fileId}\n` +
        `    object: ${item.objectName}\n` +
        `    source gen: ${item.sourceGeneration} (md5=${item.expectedMd5}, size=${item.expectedSize})\n`
    );

    const liveFile = bucket.file(item.objectName);

    // Pre-flight: does a live (current) version already exist?
    let liveExists;
    try {
      [liveExists] = await liveFile.exists();
    } catch (err) {
      process.stderr.write(`    FAIL — .exists() threw: ${err.code || ''} ${err.message}\n`);
      report.push({
        ...item,
        action: 'fail',
        reason: 'exists-threw',
        error: { code: err.code, message: err.message },
      });
      printSummary(report);
      process.exit(1);
    }

    if (liveExists) {
      let meta;
      try {
        [meta] = await liveFile.getMetadata();
      } catch (err) {
        process.stderr.write(
          `    FAIL — .getMetadata() threw on existing live object: ${err.code || ''} ${err.message}\n`
        );
        report.push({
          ...item,
          action: 'fail',
          reason: 'getmetadata-threw',
          error: { code: err.code, message: err.message },
        });
        printSummary(report);
        process.exit(1);
      }
      if (meta.md5Hash === item.expectedMd5) {
        process.stderr.write(
          `    SKIP — already restored (live md5 matches source generation)\n`
        );
        report.push({
          ...item,
          action: 'skip',
          reason: 'already-restored',
          liveMd5: meta.md5Hash,
        });
        continue;
      }
      // Different live version — refuse to overwrite without explicit direction.
      process.stderr.write(
        `    ABORT — live version exists with DIFFERENT md5 (live=${meta.md5Hash}, source=${item.expectedMd5}); refusing to overwrite\n`
      );
      report.push({
        ...item,
        action: 'abort',
        reason: 'live-md5-mismatch',
        liveMd5: meta.md5Hash,
      });
      printSummary(report);
      process.exit(1);
    }

    if (!APPLY) {
      process.stderr.write(
        `    WOULD COPY gen=${item.sourceGeneration} → live (DRY-RUN; pass --apply to execute)\n`
      );
      report.push({ ...item, action: 'would-copy', dryRun: true });
      continue;
    }

    // APPLY: server-side copy from non-current generation onto the live name.
    try {
      const sourceFile = bucket.file(item.objectName, {
        generation: item.sourceGeneration,
      });
      await sourceFile.copy(liveFile);
    } catch (err) {
      process.stderr.write(`    FAIL — copy threw: ${err.code || ''} ${err.message}\n`);
      report.push({
        ...item,
        action: 'fail',
        reason: 'copy-threw',
        error: { code: err.code, message: err.message },
      });
      printSummary(report);
      process.exit(1);
    }

    // Verify post-copy md5 matches the source generation's md5.
    let postMeta;
    try {
      [postMeta] = await liveFile.getMetadata();
    } catch (err) {
      process.stderr.write(
        `    FAIL — post-copy .getMetadata() threw: ${err.code || ''} ${err.message}\n`
      );
      report.push({
        ...item,
        action: 'fail',
        reason: 'post-copy-getmetadata-threw',
        error: { code: err.code, message: err.message },
      });
      printSummary(report);
      process.exit(1);
    }
    if (postMeta.md5Hash !== item.expectedMd5) {
      process.stderr.write(
        `    FAIL — post-copy md5 mismatch (live=${postMeta.md5Hash}, expected=${item.expectedMd5})\n`
      );
      report.push({
        ...item,
        action: 'fail',
        reason: 'post-copy-md5-mismatch',
        liveMd5: postMeta.md5Hash,
      });
      printSummary(report);
      process.exit(1);
    }

    process.stderr.write(`    PASS — md5 verified (${postMeta.md5Hash})\n`);
    report.push({
      ...item,
      action: 'restored',
      liveMd5: postMeta.md5Hash,
    });
  }

  printSummary(report);
}

run().catch((err) => {
  process.stderr.write(`\nFATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
