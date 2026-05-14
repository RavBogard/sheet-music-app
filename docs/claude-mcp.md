# Connecting Claude to centralreform.live

The app exposes an **MCP server** so you can ask Claude — in Claude Desktop, Claude.ai on the web, or Claude Code — about your setlists and song library in plain language.

> **Phase status:** read-only tools are live (list/view setlists, search the library, view a song). Tools that *change* setlists (create, add tracks, reorder) are a later phase.

## 1. Generate an access token

1. Open **Settings** in centralreform.live.
2. Find the **Integrations → Claude / MCP Access** section.
3. Type a label (e.g. "Claude Desktop") and click **Generate**.
4. **Copy the token immediately** — it starts with `crl_live_` and is shown only once. If you lose it, revoke it and generate a new one.

Each token belongs to your account. Anything Claude does through it acts as you.

## 2. Connect Claude

The MCP endpoint is:

```
https://centralreform.live/api/mcp
```

### Claude Desktop / Claude.ai (web)

1. **Settings → Connectors → Add custom connector**.
2. **URL:** `https://centralreform.live/api/mcp`
3. **Authentication:** Bearer token — paste your `crl_live_...` token.
4. Save. Claude will list the available tools once connected.

### Claude Code

```bash
claude mcp add centralreform-live https://centralreform.live/api/mcp \
  --header "Authorization: Bearer crl_live_your_token_here"
```

## 3. What you can ask

Once connected, try:

- "Show me my upcoming setlists"
- "What songs are on the setlist for next Shabbat?"
- "Find songs in G with a BPM under 80"
- "Look up the song 'Lecha Dodi'"

### Tools available (read-only)

| Tool | What it does |
|---|---|
| `list_setlists` | Lists setlists, newest first; optional date range |
| `get_setlist` | One setlist with its tracks in performance order |
| `search_library` | Searches songs by title, with optional key / BPM filters |
| `get_song` | One song's metadata (title, key, BPM, vocal lead) |

Tools return metadata only — never chart PDF files.

## 4. Managing tokens

Back in **Settings → Integrations → Claude / MCP Access** you can see every active token (label, when created, when last used) and **revoke** any of them. Revocation is immediate — a revoked token stops working on its next request.

## 5. Security notes

- The token is stored hashed — the app never keeps the raw value, which is why you only see it once.
- Treat the token like a password. If a device is lost or a token leaks, revoke it.
- Revoke tokens you no longer use.
