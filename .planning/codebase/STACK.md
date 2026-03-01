# Technology Stack

## Language & Runtime
- **TypeScript**: 5.x (strict mode enabled)
- **JavaScript Runtime**: Node.js (Next.js App Router)
- **Target Runtime**: Browser (React 19.2.3) + Server (Next.js)

## Core Framework
- **Frontend Framework**: React 19.2.3
- **Full-Stack Framework**: Next.js 16.1.4 (App Router)
  - API Routes: `/src/app/api/*` for backend endpoints
  - Server Components & Client Components mixed
  - Built-in middleware support

## UI & Styling
- **CSS Framework**: TailwindCSS 4.x
- **Component Library**: Radix UI (unstyled, accessible components)
- **Icon Library**: Lucide React (SVG icons)
- **Styling Approach**: Utility-first CSS via Tailwind

## State Management
- **Client State**: Zustand (lightweight, subscribe-based)
- **Server State/Data Fetching**: React Query (TanStack Query)
- **Global Stores**: Defined in `src/store/` directory

## Build & Bundling
- **Build Tool**: Turbopack (Next.js native bundler)
- **Package Manager**: npm
- **Linting**: ESLint 9.x
- **Config**: Next.js with TypeScript strict mode

## Testing
- **Unit/Integration Testing**: Vitest 3.2.1
- **E2E Testing**: Playwright
- **Test Structure**: Co-located test files (`*.test.ts`, `*.test.tsx`)
- **Test Files**: 24+ test files with ~3,089 lines of test code

## PDF & Sheet Music
- **PDF Rendering**: pdfjs-dist (Mozilla PDF.js)
- **PDF React Component**: react-pdf
- **PDF Manipulation**: pdf-lib (for editing PDFs)
- **Sheet Music Display**: opensheetmusicdisplay (music notation rendering)
- **PDF Worker**: Located in `/public/pdf.worker.js`

## Progressive Web App (PWA)
- **PWA Library**: @ducanh2912/next-pwa
- **Service Worker**: Workbox integration
- **Offline Support**: Enabled with next-pwa

## Key Dependencies by Category

### Data & API
- Firebase Admin SDK (`firebase-admin`)
- Firebase Client SDK (`firebase`)
- Google Drive API client (custom integration)
- Google Generative AI (`@google/generative-ai`)
- Resend (email service client)
- Inngest (job queue client)
- Upstash Redis (`@upstash/redis`)

### Development Tools
- TypeScript
- ESLint 9
- Prettier (code formatting)
- Vitest (testing)
- Playwright (E2E testing)

## Configuration Files
- `next.config.js` - Next.js configuration
- `tsconfig.json` - TypeScript configuration (strict mode)
- `vitest.config.ts` - Vitest test runner configuration
- `tailwind.config.ts` - TailwindCSS customization
- `.env.example` - Environment variable template
- `.eslintrc.json` - ESLint rules

## Environment Variables
See `.env.example` for:
- Firebase Client SDK configuration
- Firebase Admin credentials
- Google Drive service account
- Gemini API key
- Upstash Redis credentials
- Resend email API key
- Sentry configuration

## Build Output
- **Output Directory**: `.next/`
- **Public Assets**: `/public/`
- **Static Optimization**: Automatic image optimization via Next.js Image component
