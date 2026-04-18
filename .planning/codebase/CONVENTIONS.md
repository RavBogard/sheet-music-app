# Codebase Conventions

## TypeScript Usage
- **Strict Typing**: The codebase relies heavily on TypeScript for defining state models, component props, and API boundaries. 
- **Validation**: `zod` is utilized for runtime schema validation.
- **Linting Pragmatism**: The `eslint.config.mjs` relaxes certain rules to aid development velocity, explicitly disabling `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` (allowing `_` prefixes for intentionally unused parameters).

## State Management
- **Global State**: `zustand` is the standard library for global state. State is compartmentalized into feature-specific stores (e.g., `music-store`, `alert-store`, `chat-store`).
- **Persistence**: Zustand's `persist` middleware is used to save parts of the state to local storage (e.g., persisting user zoom preferences while excluding transient state like `isPlaying`).
- **Server State / Async**: The project leverages `@tanstack/react-query` alongside direct Firebase real-time listeners (and explicitly disables the `react-hooks/set-state-in-effect` ESLint rule to support these data-fetching patterns).

## UI/UX Patterns
- **Core Framework**: React running on Next.js.
- **Design System**: A shadcn/ui-like architecture is used. Accessible, headless primitives are provided by Radix UI (`@radix-ui/react-*`).
- **Styling**: Tailwind CSS is the primary styling engine. The application standardizes on a `cn` utility function (combining `clsx` and `tailwind-merge`) to conditionally join Tailwind classes.
- **Component Structure**: Base UI building blocks (buttons, dialogs, inputs) are isolated in `src/components/ui/`, separate from feature-level components in `src/components/`.

## General Architecture
- **Backend & Storage**: Relies on Firebase (Firestore, Storage, Auth) mixed with the Google Drive API for extensive file management and live synchronization.