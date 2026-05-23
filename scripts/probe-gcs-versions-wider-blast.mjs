#!/usr/bin/env node
/**
 * Track A2 WIDER-BLAST — GCS Object Versioning probe over the full
 * cron-blast-radius surfaced by `sync_runs.stats.deletedFiles[]` in the
 * window [<since>, <until>].
 *
 * Tier-0 READ-ONLY. No writes anywhere.
 *
 * Sibling of `probe-gcs-versions.mjs` (which scopes to the 4 fileIds
 * Daniel noticed first; that script + its output are load-bearing for
 * coder-2's `restore-gcs-versions.mjs` and are left intact).
 *
 * What it does:
 *   Phase 1: Query Firestore `sync_runs` where `startedAt` is in the
 *     [since, until] window and status:completed. Union all
 *     `stats.deletedFiles[]` entries across those runs. Dedup.
 *
 *   Phase 2: For each deduped fileId, probe ALL THREE object-name
 *     variants the cron deletes: `library/{id}.pdf`, `library/{id}.xml`,
 *     `library/{id}` (no extension). Report per-variant
 *     `versionCount` / `currentExists` / per-version metadata
 *     (generation, timeCreated, timeDeleted, size, md5Hash, crc32c,
 *     contentType, isCurrent).
 *
 *   Phase 3 (classification): emitted in the JSON per fileId —
 *     `classification: 'RESTORE-VIA-VERSIONING' | 'ABSENT-FROM-VERSIONING'
 *     | 'STILL-LIVE' | 'TINY-META' | 'MIXED'`.
 *       - RESTORE-VIA-VERSIONING: at least one variant has a prior gen
 *         (timeDeleted set, size > 0) inside the recoverable window AND
 *         no currentExists for the same variant.
 *       - STILL-LIVE: at least one variant has currentExists=true (the
 *         row is serving — no action needed).
 *       - ABSENT-FROM-VERSIONING: no variant has any prior gen (pre-
 *         versioning-enable delete OR never had Storage bytes).
 *       - TINY-META: prior gen exists but size < 1024 bytes — Daniel
 *         call (worth restoring vs. re-typing the text walkdown).
 *       - MIXED: variants disagree (e.g. .pdf RESTORE + .xml STILL-LIVE).
 *
 * Usage:
 *   node scripts/probe-gcs-versions-wider-blast.mjs                    # window defaults below
 *   node scripts/probe-gcs-versions-wider-blast.mjs --since <iso> --until <iso>
 *   node scripts/probe-gcs-versions-wider-blast.mjs --ids id1,id2,id3  # bypass sync_runs
 *
 * Defaults:
 *   --since  2026-05-22T00:00:00Z  (GCS Object Versioning enabled per [[project_backup_floors]])
 *   --until  2026-05-23T14:04:30Z  (actual blast tick; later cron ticks were post-tombstone re-listings per coder-2)
 *
 * Output:
 *   stdout — JSON summary (committed to .paul/research/track-a2-wider/wider-blast-probe-output.json)
 *   stderr — human-readable per-row trace
 *
 * Requires .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * + NEXT_PUBLIC_FIREBASE_PROJECT_ID + FIREBASE_STORAGE_BUCKET.
 *
 * Auth: firebase-adminsdk-fbsvc@crcmusiccharts (storage.objects.list +
 * .get versioning visibility, plus datastore.user for sync_runs read).
 */
import { Storage } from '@google-cloud/storage';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------- Minimal .env.local loader ----------
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  val = val.replace(/\\n/g, '\n');
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}

// ---------- Arg parsing ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, tok, i, arr) => {
    if (tok.startsWith('--')) acc.push([tok.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);

const SINCE = String(args.since || '2026-05-22T00:00:00Z');
const UNTIL = String(args.until || '2026-05-23T14:04:30Z');
const EXPLICIT_IDS = typeof args.ids === 'string' ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : null;

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'crcmusiccharts';
const BUCKET_NAME = (process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`).replace(/^gs:\/\//, '');

const TINY_THRESHOLD = 1024; // bytes — under this, classify TINY-META

// ---------- Firebase admin init ----------
function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY,
      }),
    });
  }
  return getFirestore();
}

function buildStorage() {
  return new Storage({
    projectId: PROJECT_ID,
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    },
  });
}

// ---------- Phase 1: enumerate sync_runs.deletedFiles ----------
async function enumerateDeletedFileIds(db) {
  process.stderr.write(`\n=== Phase 1: enumerate sync_runs.deletedFiles in [${SINCE}, ${UNTIL}] ===\n`);

  // startedAt is stored as ISO string per src/lib/sync-engine.ts:113
  const snap = await db.collection('sync_runs')
    .where('startedAt', '>=', SINCE)
    .where('startedAt', '<=', UNTIL)
    .get();

  process.stderr.write(`sync_runs in window: ${snap.size}\n`);

  const fileIdToRuns = new Map(); // fileId -> [{ runId, startedAt, status }]
  const runSummaries = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const summary = {
      runId: doc.id,
      startedAt: data.startedAt,
      completedAt: data.completedAt ?? null,
      status: data.status,
      deletedCount: data.stats?.deleted ?? 0,
      deletedFromStorageCount: data.stats?.deletedFromStorage ?? 0,
      totalScanned: data.stats?.totalScanned ?? 0,
    };
    runSummaries.push(summary);

    const list = Array.isArray(data.stats?.deletedFiles) ? data.stats.deletedFiles : [];
    process.stderr.write(`  run ${doc.id.slice(0, 8)}… status=${data.status} startedAt=${data.startedAt} deletedFiles.length=${list.length}\n`);
    for (const fid of list) {
      if (!fileIdToRuns.has(fid)) fileIdToRuns.set(fid, []);
      fileIdToRuns.get(fid).push({ runId: doc.id, startedAt: data.startedAt, status: data.status });
    }
  }

  process.stderr.write(`Phase 1 dedup count: ${fileIdToRuns.size} unique fileIds\n`);

  return { fileIdToRuns, runSummaries };
}

// ---------- Phase 2: probe versions for a fileId across 3 variants ----------
async function probeFileId(bucket, fileId) {
  // ONE prefix listing returns all extensions; partition into variants below.
  const [files] = await bucket.getFiles({
    prefix: `library/${fileId}`,
    versions: true,
    autoPaginate: true,
  });

  const NAME_PDF = `library/${fileId}.pdf`;
  const NAME_XML = `library/${fileId}.xml`;
  const NAME_NOEXT = `library/${fileId}`;

  const byVariant = {
    pdf: { objectName: NAME_PDF, versions: [] },
    xml: { objectName: NAME_XML, versions: [] },
    noExt: { objectName: NAME_NOEXT, versions: [] },
    // any other extension (shouldn't happen, but capture) → "other"
    other: { objectName: `library/${fileId}.*`, versions: [] },
  };

  for (const f of files) {
    const meta = {
      name: f.name,
      generation: f.generation || f.metadata.generation,
      timeCreated: f.metadata.timeCreated,
      timeDeleted: f.metadata.timeDeleted ?? null,
      updated: f.metadata.updated,
      size: f.metadata.size,
      md5Hash: f.metadata.md5Hash,
      crc32c: f.metadata.crc32c,
      contentType: f.metadata.contentType,
      isCurrent: !f.metadata.timeDeleted,
    };
    if (f.name === NAME_PDF) byVariant.pdf.versions.push(meta);
    else if (f.name === NAME_XML) byVariant.xml.versions.push(meta);
    else if (f.name === NAME_NOEXT) byVariant.noExt.versions.push(meta);
    else byVariant.other.versions.push(meta);
  }

  // Sort each variant most-recent-first
  for (const v of Object.values(byVariant)) {
    v.versions.sort((a, b) => Date.parse(b.timeCreated || 0) - Date.parse(a.timeCreated || 0));
    v.versionCount = v.versions.length;
    v.currentExists = v.versions.some((vv) => vv.isCurrent);
  }

  return byVariant;
}

// ---------- Phase 3: classify ----------
function classify(variantsBag) {
  // Per-variant verdict, then combine.
  const variantVerdicts = [];
  for (const [variant, info] of Object.entries(variantsBag)) {
    if (info.versionCount === 0) continue; // no data for this variant — skip
    if (info.currentExists) {
      variantVerdicts.push({ variant, verdict: 'STILL-LIVE' });
      continue;
    }
    // No current. Look at most-recent non-current gen for restorability.
    const top = info.versions[0];
    if (!top || !top.size) {
      variantVerdicts.push({ variant, verdict: 'ABSENT-FROM-VERSIONING' });
      continue;
    }
    const sizeBytes = Number(top.size);
    if (sizeBytes < TINY_THRESHOLD) {
      variantVerdicts.push({ variant, verdict: 'TINY-META', size: sizeBytes });
      continue;
    }
    variantVerdicts.push({ variant, verdict: 'RESTORE-VIA-VERSIONING', generation: top.generation, size: sizeBytes });
  }

  if (variantVerdicts.length === 0) return { classification: 'ABSENT-FROM-VERSIONING', perVariant: [] };

  // Combine: if any STILL-LIVE → row is serving (subset variants may still need restore — note them as MIXED)
  const verdicts = variantVerdicts.map((v) => v.verdict);
  const uniq = new Set(verdicts);
  let classification;
  if (uniq.size === 1) {
    classification = verdicts[0];
  } else if (verdicts.includes('STILL-LIVE') && verdicts.includes('RESTORE-VIA-VERSIONING')) {
    classification = 'MIXED'; // some variants live, others restorable
  } else if (verdicts.includes('STILL-LIVE')) {
    classification = 'STILL-LIVE';
  } else if (verdicts.includes('RESTORE-VIA-VERSIONING') && verdicts.includes('TINY-META')) {
    classification = 'RESTORE-VIA-VERSIONING'; // primary restorable variant outweighs a tiny sibling
  } else {
    classification = 'MIXED';
  }

  return { classification, perVariant: variantVerdicts };
}

// ---------- Phase 4: setlist coverage ----------
// Setlist doc shape (verified live 2026-05-24): top-level `fileIds: string[]`
// for the post-storage-canonical era; some older setlists carry `tracks: Array<{fileId, title, fileName, ...}>`.
// eventDate is a Firestore Timestamp (NOT ISO string) — must query with Date.
async function setlistCoverage(db, restorabilityByFileId, libraryTitlesByFileId) {
  process.stderr.write(`\n=== Phase 4: setlist coverage hotlist ===\n`);

  const SETLISTS_OF_INTEREST = [
    { id: '226309e2-78b7-48af-aa21-6aaf606b4fbe', label: 'Kabbalat Shabbat (Friday)' },
    { id: 'UnjLqKTtS4lNKQfMY6hB', label: 'Yizkor' },
  ];

  // Wider scan: all setlists with eventDate >= 2026-05-22 (Timestamp comparison via Date).
  let widerSetlists = [];
  try {
    const widerSnap = await db.collection('setlists')
      .where('eventDate', '>=', new Date('2026-05-22T00:00:00Z'))
      .get();
    widerSetlists = widerSnap.docs.map((d) => ({ id: d.id, label: d.data().name || d.data().title || '(unnamed)', data: d.data() }));
    process.stderr.write(`  setlists with eventDate >= 2026-05-22: ${widerSetlists.length}\n`);
  } catch (err) {
    process.stderr.write(`  ! wider eventDate scan failed: ${err.message}\n`);
  }

  // Union targeted + wider (dedup by id)
  const allTargets = new Map();
  for (const t of SETLISTS_OF_INTEREST) {
    try {
      const doc = await db.collection('setlists').doc(t.id).get();
      if (doc.exists) {
        allTargets.set(t.id, { id: t.id, label: t.label, data: doc.data() });
      } else {
        process.stderr.write(`  ! setlist ${t.id} (${t.label}) does not exist\n`);
        allTargets.set(t.id, { id: t.id, label: t.label, data: null });
      }
    } catch (err) {
      process.stderr.write(`  ! setlist ${t.id} fetch failed: ${err.message}\n`);
    }
  }
  for (const w of widerSetlists) if (!allTargets.has(w.id)) allTargets.set(w.id, w);

  function isoOf(eventDate) {
    if (!eventDate) return null;
    if (typeof eventDate === 'string') return eventDate;
    if (eventDate._seconds != null) return new Date(eventDate._seconds * 1000).toISOString();
    if (typeof eventDate.toDate === 'function') return eventDate.toDate().toISOString();
    return null;
  }

  const coverage = [];
  for (const [, sl] of allTargets) {
    if (!sl.data) {
      coverage.push({ id: sl.id, label: sl.label, missing: true });
      continue;
    }
    // Derive fileIds: prefer top-level fileIds[]; fall back to tracks[].fileId.
    const tracks = Array.isArray(sl.data.tracks) ? sl.data.tracks : [];
    const trackByFid = new Map();
    for (const t of tracks) if (t?.fileId) trackByFid.set(t.fileId, t);
    const fileIds = Array.isArray(sl.data.fileIds) && sl.data.fileIds.length > 0
      ? sl.data.fileIds.slice()
      : tracks.map((t) => t?.fileId).filter(Boolean);

    const blastHits = [];
    for (const fid of fileIds) {
      if (!restorabilityByFileId.has(fid)) continue;
      const r = restorabilityByFileId.get(fid);
      const track = trackByFid.get(fid) || {};
      blastHits.push({
        fileId: fid,
        title: track.title ?? libraryTitlesByFileId.get(fid) ?? null,
        fileName: track.fileName ?? null,
        classification: r.classification,
      });
    }
    const counts = blastHits.reduce((acc, h) => {
      acc[h.classification] = (acc[h.classification] ?? 0) + 1;
      return acc;
    }, {});
    coverage.push({
      id: sl.id,
      label: sl.data.name || sl.data.title || sl.label,
      eventDate: isoOf(sl.data.eventDate),
      audience: sl.data.audience ?? null,
      fileIdCount: fileIds.length,
      blastHitCount: blastHits.length,
      counts,
      blastHits,
    });
  }

  coverage.sort((a, b) => (b.blastHitCount ?? 0) - (a.blastHitCount ?? 0));
  process.stderr.write(`  setlists examined: ${coverage.length}; with blast-radius fileIds: ${coverage.filter((c) => c.blastHitCount > 0).length}\n`);
  return { setlistsExamined: coverage.length, coverage };
}

// ---------- library_index title lookup (best-effort enrichment) ----------
async function fetchLibraryTitles(db, fileIds) {
  process.stderr.write(`\n=== Fetching library_index titles for ${fileIds.length} fileIds (enrichment) ===\n`);
  const titles = new Map();
  // Batched getAll
  const CHUNK = 250;
  const refs = fileIds.map((id) => db.collection('library_index').doc(id));
  for (let i = 0; i < refs.length; i += CHUNK) {
    const slice = refs.slice(i, i + CHUNK);
    const docs = await db.getAll(...slice);
    for (const d of docs) {
      if (d.exists) {
        const data = d.data();
        const title = data.title || data.name || data.fileName || null;
        if (title) titles.set(d.id, title);
      }
    }
  }
  process.stderr.write(`  resolved titles for ${titles.size}/${fileIds.length} fileIds\n`);
  return titles;
}

// ---------- Main ----------
async function main() {
  const db = initFirebase();
  const storage = buildStorage();
  const bucket = storage.bucket(BUCKET_NAME);

  process.stderr.write(`Bucket: ${BUCKET_NAME}\n`);
  try {
    const [bucketMeta] = await bucket.getMetadata();
    process.stderr.write(`Bucket exists; location=${bucketMeta.location}, versioning=${JSON.stringify(bucketMeta.versioning)}\n`);
  } catch (err) {
    process.stderr.write(`! Bucket metadata fetch failed: ${err.message}\n`);
    throw err;
  }

  let fileIdToRuns;
  let runSummaries = [];
  if (EXPLICIT_IDS && EXPLICIT_IDS.length) {
    process.stderr.write(`\n=== Phase 1 SKIPPED: --ids supplied (${EXPLICIT_IDS.length} ids) ===\n`);
    fileIdToRuns = new Map(EXPLICIT_IDS.map((id) => [id, []]));
  } else {
    const out = await enumerateDeletedFileIds(db);
    fileIdToRuns = out.fileIdToRuns;
    runSummaries = out.runSummaries;
  }

  // Phase 2 + 3
  process.stderr.write(`\n=== Phase 2 + 3: probe + classify per fileId ===\n`);
  const perFileResults = [];
  const restorabilityByFileId = new Map();
  let i = 0;
  for (const [fileId, runs] of fileIdToRuns) {
    i++;
    try {
      const variantsBag = await probeFileId(bucket, fileId);
      const { classification, perVariant } = classify(variantsBag);
      const totalVersions = Object.values(variantsBag).reduce((acc, v) => acc + v.versionCount, 0);
      const summary = {
        ok: true,
        fileId,
        classification,
        totalVersionsAcrossVariants: totalVersions,
        variants: variantsBag,
        perVariantVerdict: perVariant,
        sourceRuns: runs,
      };
      perFileResults.push(summary);
      restorabilityByFileId.set(fileId, { classification, perVariant });
      const variantBreakdown = Object.entries(variantsBag)
        .filter(([, v]) => v.versionCount > 0)
        .map(([k, v]) => `${k}:${v.versionCount}${v.currentExists ? '(live)' : ''}`)
        .join(' ');
      process.stderr.write(`  [${i}/${fileIdToRuns.size}] ${fileId.slice(0, 24)}… ${classification.padEnd(24)} variants=[${variantBreakdown || 'none'}]\n`);
    } catch (err) {
      perFileResults.push({
        ok: false,
        fileId,
        error: { code: err.code, message: err.message },
        sourceRuns: runs,
      });
      restorabilityByFileId.set(fileId, { classification: 'PROBE-ERROR', perVariant: [] });
      process.stderr.write(`  [${i}/${fileIdToRuns.size}] ${fileId.slice(0, 24)}… PROBE-ERROR: ${err.message}\n`);
    }
  }

  // Library title enrichment (best-effort; failure non-fatal)
  let libraryTitles = new Map();
  try {
    libraryTitles = await fetchLibraryTitles(db, [...fileIdToRuns.keys()]);
  } catch (err) {
    process.stderr.write(`  ! library_index title fetch failed: ${err.message}\n`);
  }

  // Attach title to perFile rows
  for (const r of perFileResults) {
    if (r.ok && libraryTitles.has(r.fileId)) r.title = libraryTitles.get(r.fileId);
  }

  // Phase 4
  const setlistCoverageOut = await setlistCoverage(db, restorabilityByFileId, libraryTitles);

  // Aggregate counts
  const classCounts = perFileResults.reduce((acc, r) => {
    const key = r.ok ? r.classification : 'PROBE-ERROR';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    probedAt: new Date().toISOString(),
    bucket: BUCKET_NAME,
    since: SINCE,
    until: UNTIL,
    explicitIds: EXPLICIT_IDS,
    runSummaries,
    dedupedFileIdCount: fileIdToRuns.size,
    classCounts,
    perFile: perFileResults,
    setlistCoverage: setlistCoverageOut,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(`\n=== Done ===\n`);
  process.stderr.write(`Class counts: ${JSON.stringify(classCounts)}\n`);
}

main().catch((err) => {
  process.stderr.write(`\nFATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
