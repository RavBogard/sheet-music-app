#!/usr/bin/env node
/**
 * Regenerate trimmed feed-tier book snapshots from the shireishabbat Typst
 * pipeline's JSON feeds.
 *
 * The full feeds carry every block of liturgical text (287KB–1.05MB each).
 * The outline layer only needs "which unit is on which printed page", so we
 * keep {id, name, folios} per unit and drop everything else.
 *
 * Snapshots are committed to git on purpose: the setlist path must never
 * depend on the shireishabbat repo being present, built, or deployed.
 *
 * TWO THINGS THIS SCRIPT MUST NOT DO (R-0902-live-cw-2, R-0831-live-pagemap-1):
 *
 *   1. It must not compute `pages`. `pages` is the PRINTED page count and a
 *      book continues past its last prayer — Shirei Tshuvah's last unit is on
 *      folio 182 and the book is 184 printed pages. A `maxFolio` would write
 *      182 over 184 and silently shorten a printed book. The recorded value in
 *      registry.json is authoritative; this script ASSERTS against it.
 *
 *   2. It must not read an unpinned build. `dist/` is whatever was last built
 *      locally; `dist-app/` is the licensed carrier a printed volume was
 *      pressed from. A PRINTED volume pins the `printing.gitSha` it may be
 *      regenerated from, and a mismatch is a hard refusal — a printed volume's
 *      pin is its press commit, never HEAD.
 *
 *      An ALPHA DRAFT has no press commit to pin to, and pinning one anyway
 *      was backwards: it froze the two Shabbat drafts at the commit they
 *      happened to be at and refused every later build of them, including the
 *      one that answers the folio-145 question. Ruling 8 (2026-09-15) settles
 *      which books are which — Shirei Tshuvah is the only released volume —
 *      and R2-b drops the pin for `shabbat-maariv` and `shabbat-shacharit`
 *      accordingly. The guard stays armed where it means something.
 *
 * Usage: npm run sync:books [-- --repo <path>] [--feed-dir <name>] [--check]
 *        npm run sync:books -- --from-latest [--check]
 *        npm run sync:books -- --from-run <runId>
 *        npm run sync:books -- --from-url <artifact zip url>
 *
 *        --check       writes nothing and reports drift instead.
 *        --from-*      reads shireishabbat's published `dist-app` artifact
 *                      instead of a local checkout, so a book or moments
 *                      update is not blocked on Daniel's laptop having run a
 *                      Typst build. Needs SHIREISHABBAT_ARTIFACT_TOKEN. The
 *                      fetched copy goes through the identical trim and the
 *                      identical pin guard; see scripts/ops/lib/fetch-dist-app.mjs.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fetchDistApp } from "./lib/fetch-dist-app.mjs";

const DEFAULT_REPO = "C:/Users/dsbog/shireishabbat";
const OUT_DIR = resolve(process.cwd(), "src", "data", "books");
/** The moments artifact, produced by shireishabbat's build/tools/emit_moments.py. */
const MOMENTS_FEED = "moments.json";
const MOMENTS_OUT = join(OUT_DIR, "moments.json");
const REGISTRY = join(OUT_DIR, "registry.json");
const EXPECTED_SCHEMA_VERSION = 1;

/** The pinned carrier. `dist/` is an unpinned local build — see the header. */
const DEFAULT_FEED_DIR = "dist-app";

const VOLUMES = [
  {
    slug: "shabbat-maariv",
    feed: "shabbat-maariv-feed.json",
    title: "Shirei Shabbat — Friday Night",
    // Alpha draft, not a printed volume (Ruling 8 / R2-b). No press commit
    // exists, so there is nothing honest to pin to.
    pin: null,
  },
  {
    slug: "shabbat-shacharit",
    feed: "shabbat-shacharit-feed.json",
    title: "Shirei Shabbat — Shabbat Morning",
    // Alpha draft — see shabbat-maariv above.
    pin: null,
  },
  {
    slug: "shirei-tshuvah",
    feed: "shirei-tshuvah-feed.json",
    title: "Shirei Tshuvah — Rosh Hashanah",
    pin: "21417d9-LICENSED",
  },
];

function flag(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const isStrict = () => process.argv.includes("--strict");
const repoPath = () => flag("--repo") ?? DEFAULT_REPO;
const feedDirName = () => flag("--feed-dir") ?? DEFAULT_FEED_DIR;
const isCheck = () => process.argv.includes("--check");

/**
 * Where the feeds come from this run: a local checkout, or the published
 * artifact. Returns the same shape either way — a directory that looks like
 * `dist-app/`, and a cleanup to call when the sync is done.
 */
async function openSource() {
  const fromUrl = flag("--from-url");
  const fromRun = flag("--from-run");
  const fromLatest = process.argv.includes("--from-latest");
  if (fromUrl || fromRun || fromLatest) {
    const slug = flag("--repo-slug") ?? undefined;
    const { dir, cleanup } = await fetchDistApp({ fromUrl, fromRun, slug });
    const where = fromUrl
      ? "--from-url"
      : fromRun
        ? `run ${fromRun}`
        : "the newest published artifact";
    return { dist: dir, dirName: `dist-app (${where})`, cleanup };
  }
  const dist = join(repoPath(), feedDirName());
  return { dist, dirName: feedDirName(), cleanup: () => {} };
}

/** The printed page count for a volume, from the authoritative registry. */
function recordedPages(registry, slug) {
  const entry = registry.find((r) => r.slug === slug);
  if (!entry)
    throw new Error(
      `${slug}: no registry.json entry. \`pages\` has no authoritative source.`,
    );
  if (!Number.isInteger(entry.pages) || entry.pages <= 0) {
    throw new Error(
      `${slug}: registry.json records pages=${JSON.stringify(entry.pages)}, not a positive integer.`,
    );
  }
  return entry.pages;
}

function trim(feed, vol, pages) {
  if (feed.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `${vol.slug}: feed schemaVersion ${feed.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}. ` +
        `The feed contract changed — review build/schema/feed.schema.json before re-running.`,
    );
  }

  // V2 — the pin. A printed volume is regenerated from its press commit or
  // not at all. This is what stops an unpinned build reaching src/data/books.
  // A draft (`pin: null`) has no press commit and is regenerated freely.
  const sha = feed.printing?.gitSha ?? null;
  if (vol.pin !== null && sha !== vol.pin) {
    throw new Error(
      `${vol.slug}: feed is built from ${JSON.stringify(sha)}, pinned to ${JSON.stringify(vol.pin)}. ` +
        `Refusing to regenerate a pinned volume from an unpinned build (R-0831-live-pagemap-1).`,
    );
  }

  const units = [];
  let maxFolio = 0;
  for (const u of feed.units ?? []) {
    const folios = (u.folios ?? [])
      .filter((f) => Number.isInteger(f))
      .sort((a, b) => a - b);
    if (folios.length === 0) continue;
    for (const f of folios) if (f > maxFolio) maxFolio = f;
    units.push({ id: u.id, name: u.name ?? u.id, folios });
  }
  if (units.length === 0)
    throw new Error(`${vol.slug}: feed produced zero units`);

  // V1 — `pages` is asserted, never computed. An identity that stays true as
  // a book changes: the last prayer cannot fall past the last printed page.
  if (maxFolio > pages) {
    throw new Error(
      `${vol.slug}: feed's last unit is on folio ${maxFolio}, past the recorded ${pages} printed pages. ` +
        `Either the recorded page count is stale or this is the wrong build — not resolvable here.`,
    );
  }

  return {
    book: { slug: vol.slug, title: vol.title, tier: "feed", pages, units },
    maxFolio,
  };
}

/**
 * A press pin with its licence marker removed.
 *
 * `.live` pins a printed volume as `6f61874-LICENSED`; the feed's own
 * `printing.gitSha` carries the same string, and the moments producer copies it
 * verbatim into `sources[].gitSha`. Normalising BOTH sides means the guard can
 * never refuse over a marker that is present on one side only — the thing being
 * compared is the commit.
 */
function bareSha(v) {
  return typeof v === "string" ? v.replace(/-LICENSED$/, "") : v;
}

/**
 * Consume `dist-app/moments.json` into a trimmed `src/data/books/moments.json`.
 *
 * WHAT A MOMENT IS. One liturgical moment — Mi Chamocha — printed in several
 * books at several pages. The artifact keys on the unit-id STEM, so a single
 * moment gathers its occurrences across every book that prints it. That is what
 * lets a setlist row survive a change of book: `momentForUnit` turns this book's
 * unit into a moment, `occurrencesForMoment` finds that moment in the new one.
 *
 * NO TEXT, EVER. The artifact carries ids, display names, kinds and page
 * numbers. Liturgical text never enters this repo, and the trim below keeps
 * exactly three fields per occurrence, so nothing can arrive by accident.
 *
 * THE PIN GUARD. A printed volume's derived data generates from its press
 * commit, never HEAD (R-0831-live-pagemap-1). The book snapshots in this repo
 * were trimmed from feeds built at a specific commit; consuming a moments file
 * built from a DIFFERENT commit would pair this repo's page numbers with another
 * build's unit ids, silently. So every PINNED book's pin must equal the `gitSha`
 * the artifact recorded for it, or the step refuses and writes nothing. A draft
 * (`pin: null`, R2-b) still needs a source row — pairing blind is the thing
 * being refused, and that is true of a draft too — but its sha is free.
 *
 * Pure — no filesystem, so `scripts/__tests__/sync-books-moments.test.ts` can
 * drive every branch from fixtures.
 */
export function trimMoments(artifact, volumes, knownBooks, remap = (o) => o) {
  if (artifact.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `moments.json schemaVersion ${artifact.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}.`,
    );
  }
  const sources = Array.isArray(artifact.sources) ? artifact.sources : [];
  for (const vol of volumes) {
    const src = sources.find((x) => x.book === vol.slug);
    if (!src) {
      throw new Error(
        `moments.json carries no source row for '${vol.slug}'. ` +
          `This repo's ${vol.slug}.json was trimmed from that feed; refusing to pair them blind.`,
      );
    }
    if (vol.pin !== null && bareSha(src.gitSha) !== bareSha(vol.pin)) {
      throw new Error(
        `${vol.slug}: moments.json was built from ${JSON.stringify(src.gitSha)}, ` +
          `this repo pins ${JSON.stringify(vol.pin)}. Refusing — a printed volume's ` +
          `derived artifacts generate from its press commit, never HEAD ` +
          `(R-0831-live-pagemap-1).`,
      );
    }
  }

  // Occurrences in books this repo does not carry are dropped: `.live` cannot
  // reference a page in a book with no registry entry, and keeping them would
  // multiply the file for nothing.
  const moments = [];
  let occurrenceCount = 0;
  for (const m of artifact.moments ?? []) {
    const occurrences = [];
    const seen = new Set();
    for (const raw of m.occurrences ?? []) {
      const o = remap(raw);
      if (!o) continue;
      if (!knownBooks.has(o.book)) continue;
      if (seen.has(`${o.book}|${o.unitId}`)) continue;
      seen.add(`${o.book}|${o.unitId}`);
      const folios = (o.folios ?? []).filter((f) => Number.isInteger(f));
      occurrences.push({ book: o.book, unitId: o.unitId, folios });
    }
    if (occurrences.length === 0) continue;
    occurrenceCount += occurrences.length;
    moments.push({
      id: m.id,
      display: { en: m.display?.en ?? m.id },
      kind: m.kind ?? null,
      aliases: Array.isArray(m.aliases) ? m.aliases : [],
      occurrences,
    });
  }
  if (moments.length === 0) {
    throw new Error(
      "moments.json produced zero moments for the books this repo carries — " +
        "that is a wrong artifact, not an empty one.",
    );
  }

  return {
    trimmed: {
      schemaVersion: artifact.schemaVersion,
      builtAt: artifact.builtAt ?? null,
      sources: sources
        .filter((x) => knownBooks.has(x.book) || MACHZOR_VOLUMES.has(x.book))
        .map((x) => ({
          book: x.book,
          gitSha: x.gitSha,
          pinValue: x.pinValue ?? null,
        })),
      moments,
    },
    occurrenceCount,
  };
}

/**
 * The six per-service feeds that ARE the one printed 2008 machzor.
 *
 * shireishabbat models them as six volumes because a davener davens from one
 * service; `.live` registers the printed object, which is one book. Neither is
 * wrong (R2-e), and the mapping between them is what lets a machzor row reach
 * a moment id at all — without it every occurrence in these six is dropped as
 * "a book this repo does not carry", and a Kol Nidre row has no identity the
 * cue log could ever be matched on.
 */
const MACHZOR_VOLUMES = new Set([
  "crc-erev-rh",
  "crc-rh-morning",
  "crc-kol-nidre",
  "crc-yk-morning",
  "crc-yizkor",
  "crc-neilah",
]);
const MACHZOR_BOOK = "crc-machzor-2008";

/**
 * Fold a machzor volume's occurrence into the printed book.
 *
 * THE FOLIO IS REPLACED, NOT KEPT. The feed's `folios` are that service
 * booklet's own numbering — Kol Nidre's Bar'chu is folio 8 there and page 100
 * in the printed volume. Carrying the booklet number under the printed book's
 * slug would be a wrong page wearing a right name, so the page comes from
 * `crc-machzor-2008.json`, which took it from the same capture's
 * `printedFolio`. A unit the pagemap does not know is dropped rather than
 * guessed.
 */
function machzorRemapper(printedPageByUnitId) {
  return (o) => {
    if (!MACHZOR_VOLUMES.has(o.book)) return o;
    const page = printedPageByUnitId.get(o.unitId);
    if (!Number.isInteger(page)) return null;
    return { book: MACHZOR_BOOK, unitId: o.unitId, folios: [page] };
  };
}

function syncMoments(dist, dirName, check) {
  const path = join(dist, MOMENTS_FEED);
  if (!existsSync(path)) {
    // Absence is a normal state: the artifact is gitignored in shireishabbat
    // and only exists after a build there. Say so loudly and leave the
    // committed file alone rather than emptying it.
    console.log(
      `\nmoments: ${MOMENTS_FEED} is not in ${dirName}/ — skipped; ` +
        `src/data/books/moments.json left as it is.\n` +
        `         Run build/build-app.sh in shireishabbat to produce it.`,
    );
    return;
  }
  const knownBooks = new Set(
    JSON.parse(readFileSync(REGISTRY, "utf8")).map((r) => r.slug),
  );
  const machzorPath = join(OUT_DIR, `${MACHZOR_BOOK}.json`);
  const printedPageByUnitId = new Map();
  if (existsSync(machzorPath)) {
    for (const e of JSON.parse(readFileSync(machzorPath, "utf8")).entries ??
      []) {
      if (e.unitId && Number.isInteger(e.page))
        printedPageByUnitId.set(e.unitId, e.page);
    }
  }
  const { trimmed, occurrenceCount } = trimMoments(
    JSON.parse(readFileSync(path, "utf8")),
    VOLUMES,
    knownBooks,
    machzorRemapper(printedPageByUnitId),
  );
  const next = JSON.stringify(trimmed, null, 4) + "\n";
  const prev = existsSync(MOMENTS_OUT)
    ? readFileSync(MOMENTS_OUT, "utf8")
    : null;
  if (!check) writeFileSync(MOMENTS_OUT, next, "utf8");
  const verdict = momentsDrift(prev, next);
  console.table([
    {
      artifact: "moments.json",
      moments: trimmed.moments.length,
      occurrences: occurrenceCount,
      books: trimmed.sources.length,
      drift: verdict,
    },
  ]);
  return verdict;
}

/**
 * Drift in moments.json, told apart from provenance.
 *
 * Every rebuild of the producer stamps a new `builtAt`, and an UNPINNED book's
 * `gitSha` moves with every commit there. Neither of those changes which
 * moment is printed on which page. Calling them DIFFERS would make the CI
 * agreement check red on every producer commit and worthless inside a week, so
 * the verdict separates the two: `DIFFERS` means a moment or an occurrence
 * moved — the thing that reaches the band as a wrong page — and `provenance`
 * means only the stamp moved.
 *
 * The pin guard is untouched and sits upstream of this. `trimMoments` already
 * refuses outright when a PINNED volume's sha does not match, and that refusal
 * is a throw, not a verdict to be weighed here.
 */
export function momentsDrift(prev, next) {
  if (prev === null) return "new";
  if (drift(prev, next) === "none") return "none";
  try {
    const material = (s) => JSON.stringify(JSON.parse(s).moments ?? null);
    return material(prev) === material(next) ? "provenance" : "DIFFERS";
  } catch {
    return "DIFFERS";
  }
}

/**
 * Drift, ignoring the line endings git gave the working copy.
 *
 * This script writes LF. On a Windows checkout `core.autocrlf` hands the
 * working copy back with CRLF, so a byte compare calls a file DIFFERS that is
 * identical in every commit either version would produce. That false alarm now
 * reaches a reader — `emit-machzor-book.mjs` ends by printing this verdict —
 * so the comparison is on content, which is the thing anyone actually means.
 */
function drift(prev, next) {
  if (prev === null) return "new";
  return prev.replace(/\r\n/g, "\n") === next ? "none" : "DIFFERS";
}

async function main() {
  const { dist, dirName, cleanup } = await openSource();
  if (!existsSync(dist)) {
    cleanup();
    throw new Error(
      `shireishabbat ${dirName}/ not found at ${dist}. Pass --repo <path>, or --from-latest to ` +
        "read the published artifact instead of a local checkout.",
    );
  }
  try {
    run(dist, dirName);
  } finally {
    cleanup();
  }
}

/**
 * Run the producer's own agreement check against this repo's moments.json.
 *
 * WHY THIS EXISTS ALONGSIDE `momentsDrift`. They answer different questions.
 * `momentsDrift` compares what this repo just regenerated against what it held
 * before — it catches a page or a pin moving, but only ever through this
 * repo's own `trimMoments`. If that trim were wrong, drift would be "none" and
 * the repo would agree with itself forever. `moments_agree.py` ships inside
 * dist-app (R-0920-code-21) and compares semantics directly: moment ids, unit
 * ids, and (momentId, unitId) pairs, keyed on the unit id's service suffix. It
 * is the corpus's definition of agreement rather than a reimplementation here,
 * which is the whole reason to prefer it — and keying on the service suffix is
 * why filing all six High Holy Day volumes under `crc-machzor-2008` reads as a
 * naming difference and not a disagreement.
 *
 * ABSENCE IS NOT FAILURE. An older artifact predates the tool, and a machine
 * may have no `python3`. Either way this reports and returns "skipped": the
 * check is an added guarantee, not a new dependency of the sync.
 *
 * WHY IT IS HANDED A COPY OUTSIDE THE REPO, AND NOT `src/data/books/moments.json`.
 * Given a path inside a git work tree, the checker compares that repo's
 * COMMITTED HEAD instead of the file on disk, and says so in a note — reasonable
 * for its own purpose (a repo is answerable for what it committed), and a false
 * pass for ours. Measured 2026-09-20: a corrupted moment id in the working tree
 * was reported `OK` against HEAD, and only this repo's own `momentsDrift` failed
 * the gate. Sync's whole job is to compare what it just regenerated, before it
 * is committed, so it copies the bytes to a temp file outside any work tree. The
 * same corruption then fails with the exact id named. Do not "simplify" this
 * back to passing MOMENTS_OUT directly.
 *
 * THE WORKAROUND HAS AN EXPIRY. Reported upstream 2026-09-20; shireishabbat
 * is adding a first-class `--tree` flag that compares the working tree, and
 * a self-test fixture (clean HEAD, corrupt tree) that proves it bites. HEAD
 * stays their default deliberately — a verdict that changes with no commit
 * is not a measurement, and it is what keeps a peer's in-flight edit from
 * failing their gate. Once an artifact arrives carrying `--tree`, pass it
 * and drop the temp copy.
 */
function momentsAgree(dist, dirName) {
  // `unzip -j` flattens, the `tar` fallback does not. Accept either shape.
  const tool = [
    join(dist, "moments_agree.py"),
    join(dist, "tools", "moments_agree.py"),
  ].find((p) => existsSync(p));
  if (!tool) {
    console.log(`
agree: moments_agree.py is not in ${dirName}/ — skipped (artifact predates R-0920-code-21).`);
    return "skipped";
  }
  const probe = join(
    mkdtempSync(join(tmpdir(), "live-moments-agree-")),
    "moments.json",
  );
  writeFileSync(probe, readFileSync(MOMENTS_OUT, "utf8"), "utf8");
  try {
    return runAgree(tool, dist, probe, dirName);
  } finally {
    rmSync(dirname(probe), { recursive: true, force: true });
  }
}

function runAgree(tool, dist, probe, dirName) {
  for (const exe of ["python3", "python"]) {
    const r = spawnSync(exe, [tool, "--dist", dist, probe], {
      encoding: "utf8",
    });
    if (r.error) continue;
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
    if (out)
      console.log(`
agree (${dirName}/moments_agree.py):
${out}`);
    return r.status === 0 ? "agrees" : "DIFFERS";
  }
  console.log(`
agree: no python on PATH — skipped.`);
  return "skipped";
}

function run(dist, dirName) {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const check = isCheck();
  const summary = [];
  for (const vol of VOLUMES) {
    const feedPath = join(dist, vol.feed);
    if (!existsSync(feedPath)) throw new Error(`missing feed: ${feedPath}`);
    const pages = recordedPages(registry, vol.slug);
    const { book, maxFolio } = trim(
      JSON.parse(readFileSync(feedPath, "utf8")),
      vol,
      pages,
    );
    const outPath = join(OUT_DIR, `${vol.slug}.json`);
    const next = JSON.stringify(book, null, 4) + "\n";
    const prev = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
    if (!check) writeFileSync(outPath, next, "utf8");
    summary.push({
      slug: book.slug,
      units: book.units.length,
      maxFolio,
      pages: book.pages,
      drift: drift(prev, next),
    });
  }
  console.table(summary);
  const momentsVerdict = syncMoments(dist, dirName, check);
  if (check)
    console.log(
      `\n--check: nothing written. Source ${dirName}/, pins verified, pages asserted.`,
    );

  // (l) The agreement check. Without --strict this script reports drift and
  // leaves the judgement to whoever ran it. With --strict a disagreement is
  // a failed build, which is the point of running it in CI: drift between
  // this repo's moments.json and the producer's artifact reaches the band as
  // a wrong page otherwise, and a wrong page mid-service is not fixable.
  if (isStrict()) {
    const bad = summary.filter((r) => r.drift === "DIFFERS").map((r) => r.slug);
    if (momentsVerdict === "DIFFERS") bad.push("moments.json");
    if (momentsAgree(dist, dirName) === "DIFFERS")
      bad.push("moments.json (producer's own check)");
    if (bad.length) {
      throw new Error(
        `--strict: ${bad.join(", ")} disagree with ${dirName}. ` +
          "Re-run `npm run sync:books -- --from-latest` and commit the result, or find out why " +
          "the producer moved a page.",
      );
    }
    console.log(`--strict: this repo agrees with ${dirName}.`);
  }
}

// Importable for tests without running the sync: `main()` touches the
// filesystem, `trimMoments` is pure.
const invokedDirectly =
  process.argv[1] &&
  import.meta.url.endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop(),
  );
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
