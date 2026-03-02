# TESTING
This document specifies the testing frameworks, patterns, and coverage mechanisms for the codebase.

## Frameworks
- **Unit & Integration**: Vitest (`vitest`). Selected for being natively compatible with typical Vite/modern React stacks and significantly faster than Jest.
- **End-to-End (E2E)**: Playwright (`@playwright/test`). Used for full application browser-based tests.
- **React Component Testing**: React Testing Library (`@testing-library/react`, DOM, and User Event). Validates behavior over implementation details.

## Scripts Context
- `npm run test`: Runs local test suite using Vitest.
- `npm run test:watch`: Runs local tests in watch mode.
- `npm run test:e2e`: Runs full Playwright suite.
- `npm run test:ci`: Chains Vitest and Playwright tests for CI environments.

## Mocking & Setup
- Custom environments using `jsdom` for React component mocking.
- Typical mocking practices involve Vitest module mocking (`vi.mock()`) for API calls or Firebase abstractions.

## CI/CD
Tests are built to execute strictly on CI workflows (as indicated by the `test:ci` script), validating PRs thoroughly via both component integration tests and high-level E2E tests before merges.
