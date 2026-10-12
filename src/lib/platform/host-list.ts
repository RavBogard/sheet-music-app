/**
 * Multi-tenant phase 3 — tell the Edge address list (lane 1's
 * `revalidateHostList()` in src/lib/org/hosts.ts) that `orgs/{id}.domains`
 * changed. Best effort: the list also refreshes on its own 60 s cache.
 *
 * The import is resolved at runtime and limited to that one file
 * (webpackInclude for Next; Vite's dynamic-import-vars globs ../org/*.ts), so
 * this compiles and builds both before lane 1's file exists (the import
 * rejects and is ignored) and after (it is called). Once lane 1 is merged this
 * can become a plain static import.
 */
export async function revalidateHostList(): Promise<void> {
    const name = "hosts"
    await import(/* webpackInclude: /[\\/]hosts\.ts$/ */ `../org/${name}.ts`)
        .then((m: { revalidateHostList?: () => unknown }) => m.revalidateHostList?.())
        .catch(() => {})
}
