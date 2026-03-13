# Testing Strategy

## Unit and Integration Tests
- **Framework**: Vitest
- **Environment**: Configured to use `jsdom` via `vitest.config.ts`, enabling browser DOM APIs for component testing.
- **Location Pattern**: Test files are generally co-located with their target implementations (e.g., `src/lib/api-auth.test.ts`) or placed in designated `__tests__` directories. The runner explicitly targets `src/**/*.test.ts`, `src/**/*.test.tsx`, and `bridge/src/**/*.test.ts`.
- **Tooling**: Heavy usage of Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`) to test React components by their observable behavior rather than implementation details.

## End-to-End (E2E) Tests
- **Framework**: Playwright
- **Configuration**: Defined centrally in `playwright.config.ts` with parallel execution enabled.
- **Location Pattern**: All E2E test specs reside in the `e2e/` directory (e.g., `e2e/smoke.spec.ts`).
- **Test Scope**: 
  - **Smoke Testing**: Validates application shell rendering, basic routing (preventing 500 errors), and the accessibility of static assets like `manifest.json`.
  - **Build Integrity**: Tests monitor browser console outputs to catch `ChunkLoadError` or missing build chunks.
- **Targets**: Projects are configured to simulate both desktop (`Desktop Chrome`) and mobile (`Pixel 5`) environments.
- **CI/CD**: Configured specifically for CI behaviors (retries, workers, reporter formatting, and GitHub integration).

## Available Commands
- `npm run test`: Executes Vitest once.
- `npm run test:watch`: Starts Vitest in interactive watch mode.
- `npm run test:e2e`: Triggers the Playwright test suite.
- `npm run test:ci`: Sequential run of `vitest run` followed by `playwright test`, intended for continuous integration pipelines.