# brotherslazaroff.live — Vercel + Squarespace Setup

**Goal:** point the domain you just bought at Squarespace (`brotherslazaroff.live`) at the existing Vercel deployment (`sheet-music-app`), so that visiting `brotherslazaroff.live` serves the same app and the code resolves it to the **Brothers Lazaroff** tenant.

**Good news — the app side is already done.** `src/lib/org/registry.ts` already maps `brotherslazaroff.live` → the `brotherslazaroff` org (it strips a leading `www.`, so the apex *and* `www` both resolve to the right tenant). All that's left is the DNS/domain plumbing below. (The final host→tenant wiring into `src/proxy.ts` is the v11-03 code task and is separate from this DNS work — DNS can be done now and tested as soon as the redirect lands.)

You mirror exactly what `centralreform.live` already does: **`www` is canonical, the apex (`brotherslazaroff.live`) 307-redirects to `www.brotherslazaroff.live`.**

---

## Reference values (copy-paste)

| Thing | Value |
|---|---|
| Vercel project | `sheet-music-app` |
| Vercel team ID | `team_AyFDvnGV3IHjAY32PlW1tltN` |
| Domain | `brotherslazaroff.live` |
| Apex **A** record target (Vercel anycast IP) | `76.76.21.21` |
| `www` **CNAME** target | `cname.vercel-dns.com` |

> ⚠️ **Vercel is the source of truth for the exact records.** After you add the domain in Step 1, the Vercel dashboard prints the precise A / CNAME values it wants. They are almost always the two above, but if Vercel shows something different, **use what Vercel shows** and ignore this table.

---

## Step 1 — Add the domain in Vercel

You can do this in the dashboard (recommended, shows you the exact DNS records) **or** by CLI.

### Option A — Dashboard
1. Go to **https://vercel.com** → team **(the one holding `sheet-music-app`)** → project **`sheet-music-app`**.
2. **Settings → Domains**.
3. In the "add domain" box type:
   ```
   brotherslazaroff.live
   ```
   Click **Add**.
4. Vercel will ask how to configure `www` vs apex. Choose **"Redirect `brotherslazaroff.live` → `www.brotherslazaroff.live`"** (this matches the CRC setup — www canonical). If it instead just adds both, that's fine; you can set the redirect direction afterward via the "Edit" (⋯) menu on the apex entry → **Redirect to** `www.brotherslazaroff.live` (307).
5. Vercel now shows both `brotherslazaroff.live` and `www.brotherslazaroff.live` with a **"Invalid Configuration"** / "Misconfigured" warning and the **DNS records you need to add at your registrar**. Leave this tab open — you'll copy those values into Squarespace in Step 2.

### Option B — CLI (from `C:\Users\dsbog\centralreform.live\sheet-music-app`)
```powershell
npx vercel login           # only if not already logged in on this box
npx vercel domains add brotherslazaroff.live sheet-music-app
npx vercel domains add www.brotherslazaroff.live sheet-music-app
```
Then set the apex→www redirect in the dashboard (Settings → Domains → ⋯ on the apex → Redirect to `www.brotherslazaroff.live`). The CLI will print the DNS records it expects; same values as Step 2.

---

## Step 2 — Add the DNS records at Squarespace

Squarespace is your **registrar** here (you bought the domain there but the site lives on Vercel), so you only edit DNS — you do **not** connect it to a Squarespace site.

1. Go to **https://account.squarespace.com/domains** (or Squarespace dashboard → **Domains**).
2. Click **`brotherslazaroff.live`**.
3. Open **DNS** → **DNS Settings** (sometimes labeled "Advanced DNS settings" / "Custom Records").
4. **Remove the parking records first.** Squarespace pre-populates default records that point the domain at a Squarespace parking page. Delete any existing:
   - `A` record on host `@` pointing to a Squarespace IP, and
   - `CNAME` on host `www` pointing to a Squarespace target (e.g. `ext-cust.squarespace.com` or similar), and
   - any `A` records pointing to `198.185.x.x` / `198.49.x.x` (Squarespace ranges).

   Leave the `MX`/email and `TXT`/verification records alone (those are unrelated to web hosting). Don't touch the Squarespace-internal `CNAME` used for domain ownership if one exists — only remove the **web-pointing** A/CNAME records.
5. Add these two **Custom Records** (use the exact values Vercel showed you in Step 1; the defaults are below):

   **Record 1 — apex (A record):**
   | Field | Value |
   |---|---|
   | Host | `@` |
   | Type | `A` |
   | Data / Value | `76.76.21.21` |

   **Record 2 — www (CNAME):**
   | Field | Value |
   |---|---|
   | Host | `www` |
   | Type | `CNAME` |
   | Data / Value | `cname.vercel-dns.com` |

   > Squarespace note: in the CNAME "Data" field enter `cname.vercel-dns.com` exactly (Squarespace appends the trailing dot for you — don't type `cname.vercel-dns.com.brotherslazaroff.live`). If Squarespace auto-suffixes your domain, leave the value as just `cname.vercel-dns.com`.
6. **Save.**

---

## Step 3 — Verify

1. **Back in Vercel** (Settings → Domains): wait for the warning to clear. Click **Refresh** if it doesn't auto-update. DNS usually propagates in minutes but can take up to ~1–24h. When green, Vercel auto-issues the TLS certificate (Let's Encrypt) — no action needed.
2. **From PowerShell** you can watch propagation:
   ```powershell
   nslookup brotherslazaroff.live
   nslookup www.brotherslazaroff.live
   ```
   The apex should resolve to `76.76.21.21`; `www` should resolve to a Vercel/`vercel-dns.com` target.
3. **In a browser**, once green:
   - `https://www.brotherslazaroff.live` → loads the app over HTTPS.
   - `http://brotherslazaroff.live` → 307-redirects to `https://www.brotherslazaroff.live`.

---

## What happens next (tenant routing — code, not DNS)

Once DNS is live, the domain serves the **same shared deployment** as `centralreform.live`. Tenant separation happens in code:

- `resolveOrgIdByDomain("www.brotherslazaroff.live")` → `"brotherslazaroff"` ✅ (already implemented in `src/lib/org/registry.ts`).
- **v11-03** wires that resolver into `src/proxy.ts` so each request is stamped with the right org, plus applies Brothers Lazaroff branding (band chrome, not synagogue) and the synagogue→band vocab trim.
- MCP tenant isolation is already live and proven (v11-02): David's bearer is `brotherslazaroff`-scoped; he sees only BL data.

So the order is: **(this doc) DNS now → v11-03 host routing + branding → BL is fully its own site.** DNS does not need to wait for v11-03; the domain will simply show the current (CRC-styled) app until the branding/routing phase lands, then automatically pick up BL chrome.

---

## Quick checklist

- [ ] Vercel → project `sheet-music-app` → Settings → Domains → add `brotherslazaroff.live`
- [ ] Set apex → `www` redirect (mirror CRC)
- [ ] Squarespace → Domains → `brotherslazaroff.live` → DNS → delete parking A/CNAME records
- [ ] Squarespace → add `A @ → 76.76.21.21`
- [ ] Squarespace → add `CNAME www → cname.vercel-dns.com`
- [ ] Wait for Vercel to go green + auto-issue TLS
- [ ] Verify `https://www.brotherslazaroff.live` loads and apex redirects
- [x] **Add the new domain to Firebase Auth → Authorized domains** (done 2026-06-09): `node scripts/add-auth-domains.mjs brotherslazaroff.live www.brotherslazaroff.live`. REQUIRED once per new tenant host — without it Google sign-in fails with `auth/unauthorized-domain` (the popup throws before opening, so the button appears to do nothing). Console alt: Authentication → Settings → Authorized domains.
