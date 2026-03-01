# Directory Structure & Organization

## Root Level Files
```
CentralReform.Live/
├── .git/                      # Git repository metadata
├── .github/                   # GitHub workflows and configs
├── .next/                     # Next.js build output (generated)
├── node_modules/              # Dependencies (generated)
├── .planning/                 # GSD planning documents (created by GSD)
│   └── codebase/              # Codebase analysis documents
├── src/                       # Source code (main directory)
├── public/                    # Static assets
├── e2e/                       # End-to-end tests
├── scripts/                   # Build and utility scripts
├── bridge/                    # Bridge code (purpose TBD)
├── next.config.js             # Next.js configuration
├── tsconfig.json              # TypeScript configuration
├── vitest.config.ts           # Vitest test configuration
├── tailwind.config.ts         # TailwindCSS configuration
├── package.json               # Dependencies and scripts
├── package-lock.json          # Locked dependency versions
├── .env.example               # Environment variables template
└── README.md                  # Project documentation
```

## /src - Source Code Directory

### Main Structure
```
src/
├── app/                       # Next.js App Router (pages & layouts)
├── components/                # Reusable React components
├── lib/                       # Utilities and helper functions
├── store/                     # Zustand state management
├── hooks/                     # Custom React hooks
├── types/                     # TypeScript type definitions
├── utils/                     # General utilities
├── styles/                    # Global styles (if any)
├── constants/                 # App constants
├── inngest/                   # Inngest job definitions
└── instrumentation.ts         # App instrumentation (monitoring)
```

### /src/app - Next.js App Router

**Purpose**: Page routing and API endpoints using Next.js 16 App Router

```
app/
├── layout.tsx                 # Root layout wrapper
├── page.tsx                   # Home page
├── not-found.tsx              # 404 page
├── error.tsx                  # Error boundary
├── (auth)/                    # Auth-related pages group
│   ├── login/
│   ├── signup/
│   └── reset-password/
├── (main)/                    # Main app pages group
│   ├── dashboard/
│   ├── library/
│   ├── setlists/
│   └── settings/
├── api/                       # API routes
│   ├── admin/                 # Admin operations
│   ├── ai/                    # AI/Gemini endpoints
│   ├── auth/                  # Authentication
│   ├── drive/                 # Google Drive integration
│   ├── library/               # Library management
│   ├── chat/                  # Real-time messaging
│   └── cron/                  # Scheduled tasks
├── middleware.ts              # Next.js middleware
└── providers.tsx              # Global providers (Auth, Queries, etc.)
```

### /src/components - React Components

**Organization by feature**:
```
components/
├── ui/                        # Low-level UI components (Radix-based)
│   ├── Button.tsx
│   ├── Dialog.tsx
│   ├── Dropdown.tsx
│   └── ... (other primitives)
├── sheets/                    # Sheet music display components
│   ├── SheetViewer.tsx
│   ├── SheetAnnotator.tsx
│   ├── PerformanceMode.tsx
│   └── SheetTransposer.tsx
├── setlists/                  # Setlist management components
│   ├── SetlistCard.tsx
│   ├── SetlistEditor.tsx
│   └── SetlistPicker.tsx
├── library/                   # Library browsing/search
│   ├── LibrarySearch.tsx
│   ├── SheetGrid.tsx
│   └── FilterPanel.tsx
├── auth/                      # Authentication components
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   └── AuthGuard.tsx
├── layout/                    # Layout components
│   ├── Navbar.tsx
│   ├── Sidebar.tsx
│   └── MainLayout.tsx
├── dialogs/                   # Dialog/modal components
├── common/                    # Shared components
└── ... (other feature groups)
```

**Naming Conventions**:
- PascalCase for component files: `Button.tsx`, `SheetViewer.tsx`
- One component per file
- `.test.tsx` files for tests

### /src/lib - Utilities & Library Code

```
lib/
├── firestore.ts               # Firestore database operations
├── firebase-admin.ts          # Firebase Admin SDK setup
├── google-drive.ts            # Google Drive API client (DriveClient)
├── gemini.ts                  # Google Gemini API integration
├── auth.ts                    # Authentication helpers
├── pdf-utils.ts               # PDF generation and manipulation
├── music-math.ts              # Music theory calculations (transposition, etc.)
├── validators.ts              # Input validation functions
├── logger.ts                  # Logging utility
├── http-client.ts             # Fetch wrapper or API client
└── ... (other utilities)
```

**Naming Convention**: kebab-case for files: `google-drive.ts`, `music-math.ts`

### /src/store - Zustand State Stores

```
store/
├── auth.ts                    # User auth state
├── library.ts                 # Sheet music library state
├── setlist.ts                 # Current setlist state
├── sheet.ts                   # Currently viewed sheet state
├── annotations.ts             # User annotations
├── ui.ts                      # UI state (modals, panels, etc.)
└── ... (other domain stores)
```

**Each store exports**: `useStore` hook for components

### /src/hooks - Custom React Hooks

```
hooks/
├── useAuth.ts                 # Auth context hook
├── useLibrarySearch.ts        # Library search/filter logic
├── useSetlist.ts              # Setlist management
├── useSheet.ts                # Sheet display state
├── useLocalStorage.ts         # Persistent client storage
├── useAsync.ts                # Async operation handling
└── ... (other custom hooks)
```

### /src/types - TypeScript Definitions

```
types/
├── index.ts                   # Main exports
├── models.ts                  # Database model interfaces
│   ├── Sheet
│   ├── Setlist
│   ├── User
│   └── Annotation
├── api.ts                     # API request/response types
├── firebase.ts                # Firebase-specific types
└── ... (other type files)
```

**Naming Convention**: Interfaces and Types for Firestore models

### /src/inngest - Background Jobs

```
inngest/
├── client.ts                  # Inngest client initialization
├── functions/
│   ├── generatePdf.ts         # PDF generation job
│   ├── importSheet.ts         # Import sheet music job
│   ├── processUpload.ts       # File processing job
│   └── ... (other job functions)
└── triggers.ts                # Event triggers
```

### /src/utils - General Utilities

```
utils/
├── string.ts                  # String manipulation
├── array.ts                   # Array utilities
├── date.ts                    # Date/time helpers
├── format.ts                  # Formatting functions
└── ... (other utilities)
```

**Naming Convention**: kebab-case files with specific utility focus

### /src/constants - Application Constants

```
constants/
├── config.ts                  # Configuration constants
├── messages.ts                # Error/info messages
├── limits.ts                  # Rate limits, timeouts
└── ... (other constants)
```

## /public - Static Assets

```
public/
├── pdf.worker.js              # PDF.js worker file (required for pdfjs-dist)
├── favicon.ico                # Site favicon
├── fonts/                     # Custom fonts (if any)
├── images/                    # Static images
│   ├── logo.png
│   ├── placeholder.png
│   └── ...
├── manifest.json              # PWA manifest
└── sw.js                      # Service Worker (if using PWA)
```

## /e2e - End-to-End Tests

```
e2e/
├── specs/
│   ├── auth.spec.ts           # Authentication flows
│   ├── library.spec.ts        # Library browsing
│   ├── sheets.spec.ts         # Sheet viewing/editing
│   ├── setlists.spec.ts       # Setlist management
│   └── ... (other test suites)
├── fixtures/                  # Test data
└── playwright.config.ts       # Playwright configuration
```

## /scripts - Build & Utility Scripts

```
scripts/
├── build.js                   # Custom build steps
├── postinstall.js             # Post-install setup
└── ... (other utility scripts)
```

## Key File Locations by Category

### Authentication
- `src/app/api/auth/*` - Auth API routes
- `src/lib/auth.ts` - Auth helpers
- `src/hooks/useAuth.ts` - Auth hook
- `src/store/auth.ts` - Auth state

### Sheet Music Display
- `src/components/sheets/SheetViewer.tsx` - Main viewer
- `src/lib/pdf-utils.ts` - PDF operations
- `src/lib/music-math.ts` - Music theory logic
- `src/components/sheets/SheetTransposer.tsx` - Transposition

### Setlist Management
- `src/components/setlists/*` - Setlist components
- `src/store/setlist.ts` - Setlist state
- `src/app/api/library/*` - Setlist API endpoints
- `src/hooks/useSetlist.ts` - Setlist hooks

### User Library
- `src/components/library/*` - Library UI
- `src/lib/firestore.ts` - Firestore queries
- `src/store/library.ts` - Library state
- `src/app/api/library/*` - Library endpoints

### AI Integration
- `src/app/api/ai/*` - AI API endpoints
- `src/lib/gemini.ts` - Gemini API client
- `src/inngest/functions/` - AI job definitions

### File Management
- `src/app/api/drive/*` - Google Drive endpoints
- `src/lib/google-drive.ts` - Drive client (DriveClient)
- `src/inngest/functions/importSheet.ts` - Import job

## Naming Conventions

### Files & Directories
- **Components**: PascalCase (`Button.tsx`, `SheetViewer.tsx`)
- **Utilities/Libraries**: kebab-case (`google-drive.ts`, `pdf-utils.ts`)
- **Directories**: kebab-case (`src/components/sheet-viewer/`)
- **Test Files**: `.test.ts` or `.test.tsx` suffix

### TypeScript/JavaScript
- **Interfaces/Types**: PascalCase (`User`, `SheetMetadata`)
- **Functions**: camelCase (`getUserData()`, `transposeMusicBy()`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`, `DEFAULT_ZOOM`)
- **Variables**: camelCase (`currentSheet`, `isLoading`)

### React Components
- **Component Names**: PascalCase (`<SheetViewer />`, `<SetlistCard />`)
- **Props Interfaces**: `{ComponentName}Props` (`SheetViewerProps`)
- **Hooks**: `use{Name}` (`useSheet`, `useLibrarySearch`)

### API Routes
- **Route Patterns**: `/api/resource/action` (`/api/sheets/transpose`, `/api/library/search`)
- **Methods**: Standard REST (GET, POST, PUT, DELETE)

## Firestore Collection Structure

```
users/
  {userId}/
    profile
    preferences
    library (subcollection)
    annotations (subcollection)

sheets/
  {sheetId}/
    metadata
    content (PDF blob in Storage)
    tags
    ratings
    comments (subcollection)

setlists/
  {setlistId}/
    metadata
    songs (array of sheet references)
    performance_data

annotations/
  {annotationId}/
    sheet_reference
    user_reference
    data
    created_at
```

## Adding New Code

### Adding a New Feature
1. Create feature directory: `src/components/{feature}/`
2. Create main component file: `{Feature}.tsx`
3. Add test file: `{Feature}.test.tsx`
4. Add types in `src/types/{feature}.ts`
5. Add Zustand store if needed: `src/store/{feature}.ts`
6. Add hooks if needed: `src/hooks/use{Feature}.ts`
7. Add API routes if needed: `src/app/api/{feature}/`

### Adding a New Page
1. Create directory in `src/app/{route}/`
2. Create `page.tsx` for the page component
3. Create `layout.tsx` if page has unique layout
4. Add to appropriate route group (auth, main, etc.)

### Adding a New Utility
1. Create file: `src/lib/{utility-name}.ts` or `src/utils/{utility-name}.ts`
2. Export functions with clear names
3. Add TypeScript types
4. Create `.test.ts` file if complex logic

## Special Directories

### .planning/
- **Purpose**: GSD workflow planning documents
- **Contents**: Roadmap, milestones, phase plans
- **Not committed**: Can contain work-in-progress items
- **GSD managed**: Use GSD commands to modify

### .next/
- **Purpose**: Next.js build output (auto-generated)
- **Not committed**: Added to .gitignore
- **Rebuild with**: `npm run build`

### node_modules/
- **Purpose**: Dependency packages
- **Not committed**: Added to .gitignore
- **Install with**: `npm install`
