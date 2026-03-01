# External Integrations

## Authentication & Authorization
### Firebase Authentication
- **Purpose**: User authentication and account management
- **Integration**: Client SDK (`firebase/auth`) + Admin SDK
- **Features**:
  - Google OAuth 2.0 sign-in
  - Email/password authentication
  - Session management
- **Location**: Auth logic in API routes and client auth hooks
- **Environment Variables**: `NEXT_PUBLIC_FIREBASE_*` variables

## Database & Storage

### Firestore (Firebase Database)
- **Purpose**: Primary real-time database
- **Integration**: Firebase Client SDK (`firebase/firestore`)
- **Features**:
  - Document-based NoSQL database
  - Real-time listeners for live data sync
  - Offline persistence (local caching)
  - Transaction support
- **Collections**: sheet_music, setlists, users, annotations, etc.
- **Location**: Data access layer in `src/lib/firestore.ts` and hooks

### Firebase Storage
- **Purpose**: File storage for PDF and media uploads
- **CDN Serving**: Via `firebasestorage.app` domain
- **Integration**: Firebase Client SDK (`firebase/storage`)
- **Use Cases**: Storing sheet music PDFs, user uploads
- **Access Control**: Security rules configured in Firebase console

## File Management

### Google Drive API
- **Purpose**: Integration with user's Google Drive
- **Service Account**: Service account credentials in environment
- **Location**: `src/lib/google-drive.ts` (DriveClient class)
- **Functions**:
  - List files from Google Drive
  - Download files for processing
  - Store references to Drive files
- **Authentication**: OAuth service account for server-side access
- **Environment Variables**: `GOOGLE_DRIVE_SERVICE_ACCOUNT_*`

## AI & Content Generation

### Google Gemini API
- **Model**: Gemini 3 Flash Preview
- **Purpose**: AI-powered content analysis and generation
- **Client Library**: `@google/generative-ai`
- **Use Cases**: Text analysis, metadata generation, content recommendations
- **Location**: API routes in `/src/app/api/ai/*`
- **Rate Limiting**: Not exceeding API quotas
- **Environment Variables**: `NEXT_PUBLIC_GEMINI_API_KEY`

## Email Service

### Resend
- **Purpose**: Transactional email delivery
- **Client Library**: Resend SDK
- **Rate Limiting**: 2 requests per second (per Resend docs)
- **Use Cases**: User notifications, reset emails, admin alerts
- **Location**: Email sending logic in API routes
- **Environment Variables**: `RESEND_API_KEY`

## Background Jobs & Task Queue

### Inngest
- **Purpose**: Asynchronous job processing and workflows
- **Use Cases**:
  - PDF generation in background
  - Large file processing
  - Batch operations
  - Scheduled tasks
- **Location**: Job definitions in `/src/inngest/` directory
- **Integration**: Client SDK for triggering jobs from API routes
- **Features**: Retry logic, scheduled execution, job tracking

## Rate Limiting & Caching

### Upstash Redis
- **Purpose**: Distributed rate limiting and caching
- **Implementation**: Sliding window rate limiter
- **Fallback**: In-memory implementation if Redis unavailable
- **Use Cases**:
  - API endpoint rate limiting
  - Cache for frequently accessed data
  - Session storage (optional)
- **Client Library**: `@upstash/redis`
- **Environment Variables**: `UPSTASH_REDIS_*`
- **Configuration**: Rate limit windows configured per endpoint

## Monitoring & Error Tracking

### Sentry
- **Purpose**: Error tracking and performance monitoring
- **Client Library**: `@sentry/nextjs`
- **Features**:
  - Exception tracking
  - Performance monitoring
  - User session tracking
  - Release management
- **Location**: Initialized in `src/instrumentation.ts` or `next.config.js`
- **Environment Variables**: `NEXT_PUBLIC_SENTRY_DSN`

## API Route Structure

Total: 30+ API endpoints organized by category

### Admin Endpoints (`/src/app/api/admin/*`)
- Administrative functions
- Protected routes requiring auth

### AI Endpoints (`/src/app/api/ai/*`)
- Gemini API integration endpoints
- Content analysis and generation

### Authentication Endpoints (`/src/app/api/auth/*`)
- Firebase auth integration
- Session management
- Token refresh

### Google Drive Endpoints (`/src/app/api/drive/*`)
- Google Drive file operations
- Import/export functionality

### Library Endpoints (`/src/app/api/library/*`)
- Sheet music library management
- Search and filtering

### Chat/Real-time Endpoints (`/src/app/api/chat/*`)
- Real-time messaging features
- WebSocket support (if applicable)

### Cron Task Endpoints (`/src/app/api/cron/*`)
- Scheduled background jobs
- Maintenance tasks

## Integration Security

- **Secret Management**: Environment variables for all credentials
- **Firebase Security Rules**: Configured per collection
- **Service Accounts**: Used for server-to-server communication
- **OAuth**: Google OAuth for Drive API access
- **Rate Limiting**: Upstash Redis for DoS protection
- **Validation**: Input validation at API boundaries

## Integration Health Checks
- Firebase connectivity tested on app initialization
- Sentry integration optional (fails gracefully)
- Upstash Redis with in-memory fallback
- Google Drive API timeout handling
- Gemini API quota monitoring (implemented in codebase)
