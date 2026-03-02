# INTEGRATIONS
This document maps the external services, APIs, databases, and third-party integrations used in this project.

## Authentication & Authorization
- **Provider**: Firebase Authentication
- **Service Level**: `firebase` (Client SDK), `firebase-admin` (Server/Admin SDK)
- **Auth Domains**: Connects directly to Google accounts/APIs (`accounts.google.com`, `apis.google.com`)

## Databases & Storage
- **Primary DB**: Firebase Firestore (via `firebase` and `firebase-admin`)
- **File Storage**: Google Drive API (`@googleapis/drive`)
- **Caching/Rate Limiting**: Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`)

## External Services & APIs
- **Google Generative AI**: Gemini API (`@google/generative-ai`)
- **OpenAI**: OpenAI API (`openai`)
- **Background Jobs/Event Driven Tasks**: Inngest (`inngest`)
- **Email Service**: Resend (`resend`)
- **Error Tracking & Telemetry**: Sentry (`@sentry/nextjs`)

## Subsystems & APIs
- **Sheet Music/PDF Rendering APIs**: Interacts heavily with `pdf.js` workers and `opensheetmusicdisplay` logic for rendering musical content.
