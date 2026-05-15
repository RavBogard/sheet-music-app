// Vitest stub for Next.js's `server-only` guard. The real module throws
// when imported in a non-server context — but Vitest is its own runtime,
// so we resolve it to this no-op for tests. Aliased in vitest.emulator.config.ts.
export {}
