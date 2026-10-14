# Brothers Lazaroff — MCP bearer for Claude Code / Desktop

How to author **Brothers Lazaroff** (broslaz) content over MCP. CRC authoring is
the default; this is only for when you want to act as the BL tenant.

## The endpoint

```
https://www.brotherslazaroff.live/api/mcp
```

**Use the `www.` host directly.** The bare apex (`brotherslazaroff.live`)
redirects (308) and the redirect drops the `Authorization` header, so a bearer
sent to the apex silently fails to authenticate. Same gotcha as CRC
(`https://www.centralreform.live/api/mcp` — hit www directly).

## Minting a throwaway BL bearer

Phase 9 replaced the BL-only minter with one that takes any tenant in the
registry, and stopped it borrowing David's account. A persona is now minted
through the tenant's **own address**, so which tenant it lands in is decided by
the address rather than asserted by the script — and it is a new, throwaway
identity, never a real person's.

```bash
# from sheet-music-app/ — writes the credential to --out, never to stdout
npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts --     --org brotherslazaroff --out /tmp/bl.json

# undo (token doc, membership, user doc, Auth user), using the printed identity
npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts --     --cleanup '<the JSON line it printed>'
```

- The **credential goes to `--out`**; stdout carries only the identity, so a run
  can be logged without logging the secret. Without `--out` the raw bearer goes
  to stderr instead.
- The persona is a tenant **admin** with a one-hour TTL, minted through the
  secret-gated `/api/auth/admin-test-session` endpoint, so every mint leaves an
  `adminTestSessionAudit` row.
- Auth on this box: `GOOGLE_APPLICATION_CREDENTIALS` pointing at a temporary
  `authorized_user` ADC built from the Firebase CLI refresh token (no SA creds,
  no gcloud), same path as the other admin-SDK scripts.

For a whole-platform isolation check rather than one bearer, use
`scripts/dev/e2e-tenant-probe.mjs`, which reads the tenants from the registry
and runs every ordered pair.

## Where the bearer goes

Put it in your Claude Code / Claude Desktop MCP connector config as the
`Authorization: Bearer <raw-token>` header for the broslaz `/api/mcp` endpoint
above (mirrors how the CRC connector is configured, just pointed at the BL host
with a BL-stamped token).

## ⚠️ BINDING CAVEAT — never use `issue-bl-bearer.mjs`

`scripts/issue-bl-bearer.mjs` calls `setCustomUserClaims` and overwrites
David's `orgIds` to `['brotherslazaroff']`, which **drops his `crc`
membership**. Always use `scripts/dev/mint-throwaway-bearer.ts` instead — it
never touches a real person's account at all; it mints a throwaway one and
deletes it again.

## Cleanup

Clean up when you're done — the token doc, the membership, the user doc and the
Auth user all go, and anything already missing is reported rather than thrown:

```bash
npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts --     --cleanup '<the JSON line the mint printed>'
```

---
*Phase v11.5-04 Plan 04. Scripts rewritten for N tenants in multi-tenant phase 9 (2026-10-13).*
