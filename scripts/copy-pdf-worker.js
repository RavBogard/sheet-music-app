/**
 * Copy the PDF.js worker from react-pdf's bundled pdfjs-dist into public/.
 *
 * Why: react-pdf@10.3 pins pdfjs-dist@5.4.296 as a direct dependency,
 * but we also have pdfjs-dist at root for server-side chord extraction.
 * If the worker file doesn't match the client library version,
 * PDF.js throws AbortErrors because the message protocol is mismatched.
 *
 * This script copies from react-pdf's nested pdfjs-dist so the worker
 * always matches the version react-pdf actually uses.
 *
 * Cache busting: The worker is also copied with a versioned filename
 * (pdf.worker.min.{version}.mjs) so that stale Service Worker caches
 * or CDN caches cannot serve a mismatched worker after deploys.
 */
const fs = require('fs');
const path = require('path');

const WORKER_FILENAME = 'pdf.worker.min.mjs';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEST = path.join(PUBLIC_DIR, WORKER_FILENAME);

// Prefer react-pdf's nested copy (guaranteed version match)
const SOURCES = [
  {
    worker: path.join(__dirname, '..', 'node_modules', 'react-pdf', 'node_modules', 'pdfjs-dist', 'build', WORKER_FILENAME),
    pkg: path.join(__dirname, '..', 'node_modules', 'react-pdf', 'node_modules', 'pdfjs-dist', 'package.json'),
    label: 'react-pdf nested',
  },
  {
    worker: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', WORKER_FILENAME),
    pkg: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'package.json'),
    label: 'root',
  },
];

let copied = false;
for (const src of SOURCES) {
  if (fs.existsSync(src.worker)) {
    // Read the version from the source's package.json
    const pkg = JSON.parse(fs.readFileSync(src.pkg, 'utf8'));
    const version = pkg.version;

    // Copy unversioned (backward compat during rolling deploys)
    fs.copyFileSync(src.worker, DEST);

    // Copy versioned (cache busting)
    const versionedFilename = `pdf.worker.min.${version}.mjs`;
    const versionedDest = path.join(PUBLIC_DIR, versionedFilename);
    fs.copyFileSync(src.worker, versionedDest);

    console.log(`✓ Copied ${WORKER_FILENAME} (${src.label}, v${version}) → public/`);
    console.log(`✓ Copied ${versionedFilename} → public/`);
    copied = true;
    break;
  }
}

if (!copied) {
  console.error(`✗ Could not find ${WORKER_FILENAME} in any expected location`);
  process.exit(1);
}
