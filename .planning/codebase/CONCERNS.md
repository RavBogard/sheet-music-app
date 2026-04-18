# Codebase Concerns & Technical Debt

This document outlines the primary concerns, technical debt, architectural bottlenecks, and security vulnerabilities identified in the `sheet-music-app` codebase.

## 1. Security Vulnerabilities

*   **Role Check Inconsistency in Push API (`C2`)**: The push notification send API (`/api/push/send`) performs a manual role check that fails to account for the legacy `leader` role, silently blocking notifications for these users. It should utilize the centralized `withAuth` middleware.
*   **Cron Secret Timing Attack Surface**: The backup cron job secret validation relies on simple string equality, exposing a potential timing attack surface. A constant-time string comparison should be used.
*   **Hardcoded Super Admin UID**: A hardcoded super admin UID fallback exists within the authentication middleware source code, which poses a security risk and bypasses standard role-based access controls.
*   **Missing Access Control on Public LIVE View**: The public LIVE view page lacks access control; anyone with the URL can view real-time setlist content.

## 2. Architectural Bottlenecks

*   **Unpaginated Firestore Queries**: Several API routes fetch entire Firestore collections into memory without pagination or query filters. This approach will not scale as the congregation's library and user base grow, leading to memory exhaustion and slow response times.
*   **Non-Atomic Live Mode Toggle (`C3`)**: Starting live mode requires multiple sequential Firestore writes. If a write fails mid-process, it can leave followers in a broken state. These operations should be wrapped in a Firestore transaction or batch write.
*   **Service Worker Configuration (`C1`)**: The Firebase service worker configuration (`self.__FIREBASE_CONFIG__` in `firebase-messaging-sw.js`) is never injected because it is served as a static asset from the `public/` directory. This causes all background push notifications to silently fail.

## 3. Technical Debt

*   **Dead Code & Unused Variables**: TypeScript diagnostics (`tsc --noEmit --noUnusedLocals`) reveal 73 unused variables and imports, primarily orphaned Lucide icons and partially refactored components (e.g., in `ChartSuggestions.tsx` and `SetlistEditorV2.tsx`).
*   **Legacy Data Structures**: The application maintains legacy role names (`leader` vs. `band_leader`), necessitating backward-compatibility mappings in the auth middleware.

## 4. Test Coverage Gaps

*   While the core test suite is healthy (361 passing tests across 22 test files), the presence of critical bugs in the service worker and notification API suggests a lack of end-to-end (E2E) testing for background processes and push notification delivery.
*   **Live Mode Concurrency Testing**: The non-atomic nature of the live mode toggle indicates a lack of integration tests simulating concurrent leader/follower interactions during a service.

## Recommendations

1.  **Immediate**: Fix the service worker config injection to restore background push notifications.
2.  **Immediate**: Standardize auth checks in the push API to use `withAuth`.
3.  **Short-Term**: Implement pagination for all Firestore collection queries in API routes.
4.  **Short-Term**: Refactor the live mode toggle to use atomic Firestore transactions.
5.  **Ongoing**: Clean up the 73 unused variables and imports identified by TypeScript strict mode to improve codebase clarity.
