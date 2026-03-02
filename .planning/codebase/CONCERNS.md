# CONCERNS
This document outlines technical debt, potential bug sources, security issues, performance bottlenecks, and fragile areas in the codebase.

## Performance Concerns
- **Sheet/PDF Rendering**: Working with `pdfjs-dist` and `opensheetmusicdisplay` can be highly computationally demanding. Memory leaks or main thread blocking scenarios are prominent risks, particularly for multi-page complex sheet music. Must ensure PDF workers (`scripts/copy-pdf-worker.js`) are appropriately deployed and utilized off the main thread.
- **PWA Caching Size**: The number of charts and heavy PDFs fetched might consume excessive device storage space, necessitating intelligent offline cache eviction rules (`idb`, `next-pwa`).

## Technical Debt & Fragility
- **Data Sync Constraints**: The balance of synchronizing data between Google Drive, Firebase Auth, and Firestore. Complex state sync logic exists, demanding robust retry logic under shaky network conditions.
- **Dependency Overrides**: With many UI primitive layers (`@radix-ui/*`) alongside complex state management, ensuring exact sub-dependencies remain compatible on upgrades is critical.

## Security
- **Firebase / GDrive Boundaries**: Handling OAuth tokens securely and validating the API proxy requests strictly using Upstash (`ratelimit`).
- **Data Mutation Boundaries**: Role-based access constraints must be securely validated explicitly via Firebase Admin and API boundaries, not just via UI checks or basic state flags.
