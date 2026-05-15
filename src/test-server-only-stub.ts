// Test stub for the `server-only` npm package. The real package throws when
// imported outside a React Server environment — which includes vitest's jsdom
// environment — so modules guarded with `import 'server-only'` (e.g.
// extract-document.ts) cannot be exercised in tests without this no-op alias.
// Wired in vitest.config.ts via resolve.alias.
export {}
