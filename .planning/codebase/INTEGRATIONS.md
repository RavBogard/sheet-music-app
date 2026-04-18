# INTEGRATIONS.md
# External Integrations & Services

This document maps the external dependencies, services, and APIs integrated into the CentralReform.live sheet music application.

## Firebase Ecosystem
*   **Firebase Authentication:** Handles user identity and sign-in (specifically utilizing Google Identity Services).
*   **Cloud Firestore:** The primary NoSQL database for application state and metadata.
*   **Firebase Storage:** Used for CDN file serving and storage of PDF/sheet music assets.
*   **Firebase Realtime Database:** Utilized for specific real-time synchronization features.
*   **Firebase Admin SDK:** Server-side privileged access to Firebase services.

## File Intake & Processing
*   **Google Drive API:** (`@googleapis/drive`) Deeply integrated for file intake, sourcing sheet music directly from Google Drive folders.
*   **Google Cloud Vision:** Used server-side for image analysis or OCR capabilities on sheet music/documents.

## AI & Machine Learning
*   **Google Gemini:** (`@google/generative-ai`) Integrated via the Generative Language API for AI-driven features.
*   **OpenAI:** (`openai` SDK) Used for supplementary LLM capabilities.

## Monitoring & Error Tracking
*   **Sentry:** (`@sentry/nextjs`) Configured for comprehensive error reporting, crash analytics, and performance monitoring across client and server.

## Backend Services & Utilities
*   **Upstash Redis & Rate Limiting:** (`@upstash/redis`, `@upstash/ratelimit`) Provides serverless Redis caching and API rate limiting capabilities to protect endpoints.
*   **Inngest:** (`inngest`) Integrated for managing background jobs, queues, and event-driven workflows.
*   **Resend:** (`resend`) Transactional email API for sending notifications or auth emails.

## Identity & OAuth
*   **Google Identity Services:** Directly referenced in CSP headers (`apis.google.com`, `accounts.google.com`) for sign-in popups and OAuth token exchange.
