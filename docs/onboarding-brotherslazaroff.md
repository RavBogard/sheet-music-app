# Brothers Lazaroff — Claude authoring onboarding (David)

You can author Brothers Lazaroff setlists conversationally through Claude, the
same way Daniel authors for Central Reform — and you'll only ever see Brothers
Lazaroff data. CRC's library and services are completely walled off from your
account (verified end-to-end in production, 2026-06-08).

## What you need

- **Your MCP bearer token** — Daniel will send it to you securely (it starts with
  `crl_live_…`). It is shown only once and is tied to your Brothers Lazaroff
  tenant. Treat it like a password; don't paste it into chats or commit it.
- Claude Desktop (or claude.ai / Claude Code) with MCP server support.

## Connect Claude to your library

Add this MCP server to your Claude Desktop config (Settings → Developer → Edit
Config, or the MCP servers section):

```json
{
  "mcpServers": {
    "brotherslazaroff": {
      "url": "https://www.centralreform.live/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_BEARER_TOKEN_HERE>"
      }
    }
  }
}
```

Replace `<YOUR_BEARER_TOKEN_HERE>` with the token Daniel sends you. Restart
Claude Desktop after saving.

## What you can do

Once connected, just talk to Claude in plain language:

- **Build a setlist** — "Create a setlist for our show on July 12 and add …"
- **Clone last time** — "Clone last week's set and swap the second song."
- **Add charts** — import a chart from Google Drive (give Claude the Drive link)
  or paste chord-chart text and Claude saves it to your library.
- **Browse / search** — "List my setlists", "Search my library for …", "What's
  on the July 12 set?"

Everything you create — setlists, tracks, charts — is tagged Brothers Lazaroff
automatically. You don't have to think about it.

## Tenant isolation (what "walled off" means)

- Your lists and searches return **only Brothers Lazaroff** material — never
  CRC's.
- You **cannot** open, edit, or delete anything that belongs to CRC, even by id —
  it simply reports "not found".
- New setlists and charts you create are stamped Brothers Lazaroff and are
  invisible to CRC.

## If something looks wrong

If a tool ever returns CRC data, or you can't see your own setlists, stop and
tell Daniel — don't keep editing. (This was tested thoroughly before launch, so
it should "just work.")

---
*Tenant: brotherslazaroff · MCP endpoint: https://www.centralreform.live/api/mcp ·
account: David Lazaroff (band_leader). Onboarding written 2026-06-08 (v11-02-04).*
