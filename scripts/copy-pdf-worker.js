/**
 * Copy the PDF.js worker from react-pdf's bundled pdfjs-dist into public/.
 *
 * Why: react-pdf@10.3 pins pdfjs-dist@5.4.296 as a direct dependency,
 * but we also have pdfjs-dist@5.4.530 at root for server-side chord
 * extraction. If the worker file doesn't match the client library version,
 * PDF.js throws AbortErrors because the message protocol is mismatched.
 *
 * This script copies from react-pdf's nested pdfjs-dist so the worker
 * always matches the version react-pdf actually uses.
 */
const fs = require('fs');
const path = require('path');

const WORKER_FILENAME = 'pdf.worker.min.mjs';
const DEST = path.join(__dirname, '..', 'public', WORKER_FILENAME);

// Prefer react-pdf's nested copy (guaranteed version match)
const SOURCES = [
  path.join(__dirname, '..', 'node_modules', 'react-pdf', 'node_modules', 'pdfjs-dist', 'build', WORKER_FILENAME),
  // Fallback: if npm hoists pdfjs-dist (single version), use root
  path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', WORKER_FILENAME),
];

let copied = false;
for (const src of SOURCES) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, DEST);
    const version = src.includes('react-pdf') ? '(react-pdf nested)' : '(root)';
    console.log(`✓ Copied ${WORKER_FILENAME} ${version} → public/`);
    copied = true;
    break;
  }
}

if (!copied) {
  console.error(`✗ Could not find ${WORKER_FILENAME} in any expected location`);
  process.exit(1);
}
