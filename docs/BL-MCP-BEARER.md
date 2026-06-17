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

Use the dedicated throwaway minter. It writes **only** an `mcpTokens` doc
stamped `orgId="brotherslazaroff"`, tied to David's real `band_leader` uid, so
the deployed `verifyBearer → orgFrom` seam resolves the BL tenant and the
authoring-surface role gates pass.

```bash
# from sheet-music-app/
node scripts/mint-throwaway-bl-bearer.mjs            # DRY-RUN (resolve + plan, no write)
node scripts/mint-throwaway-bl-bearer.mjs --apply    # mint: raw token → stderr, tokenId → stdout
node scripts/mint-throwaway-bl-bearer.mjs --revoke <tokenId>   # set revokedAt on that token doc
```

- The **raw token is printed once to stderr** — copy it immediately; only the
  hash is persisted.
- The **tokenId is printed to stdout** — keep it so you can `--revoke` later.
- Auth on this box: the script converts the Firebase CLI refresh token into a
  temporary `authorized_user` ADC (no SA creds / no gcloud needed), same path as
  the other admin-SDK scripts.

## Where the bearer goes

Put it in your Claude Code / Claude Desktop MCP connector config as the
`Authorization: Bearer <raw-token>` header for the broslaz `/api/mcp` endpoint
above (mirrors how the CRC connector is configured, just pointed at the BL host
with a BL-stamped token).

## ⚠️ BINDING CAVEAT — never use `issue-bl-bearer.mjs`

`scripts/issue-bl-bearer.mjs` calls `setCustomUserClaims` and overwrites
David's `orgIds` to `['brotherslazaroff']`, which **drops his `crc`
membership**. Always use `scripts/mint-throwaway-bl-bearer.mjs` instead — it
never touches David's auth claim; the token doc's `orgId` is the only thing the
MCP org seam needs.

## Cleanup

Revoke the throwaway token when you're done:

```bash
node scripts/mint-throwaway-bl-bearer.mjs --revoke <tokenId>
```

---
*Phase v11.5-04 Plan 04. Endpoint + scripts verified against the repo 2026-06-16.*
