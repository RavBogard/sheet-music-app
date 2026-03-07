# Pitfalls Research

**Domain:** Worship music setlist platform with real-time hardware control (X32 monitor mixing), offline-first PWA, brownfield UI rewrite
**Researched:** 2026-03-07
**Confidence:** HIGH (OSC/X32 protocol, Firebase offline, Google Drive API), MEDIUM (brownfield rewrite patterns, worship UX)

---

## Critical Pitfalls

### Pitfall 1: X32 OSC Keepalive Expiry Kills Monitor Sessions Mid-Service

**What goes wrong:**
The X32 mixer uses a `/xremote` subscription model where updates are only sent to clients for 10 seconds after the command is issued. If the browser client doesn't re-send `/xremote` at least every 9 seconds, the mixer silently stops broadcasting fader/mute updates. The UI shows stale values; musicians adjust sliders on their phones thinking they've changed their monitor mix, but the X32 has stopped listening. This failure is silent — no error, no indication to the user.

**Why it happens:**
Developers implement the initial connection, see it working in testing, and don't realize there is a hard timeout. The X32 protocol documentation is informal/unofficial. The failure only manifests after 10 seconds of inactivity, which rarely happens during focused development but always happens in production.

**How to avoid:**
Implement a keepalive loop in the proxy server (not the browser client) that sends `/xremote` every 8 seconds unconditionally, regardless of client activity. Never rely on the browser to maintain this loop — tab-switching, screen locks, and background throttling on mobile all interrupt JavaScript timers. The proxy server is always-on and the correct place for keepalive management.

**Warning signs:**
- Monitor mixing works in the developer's local test but fails for musicians after a few seconds
- Mixer fader values on the UI diverge from what the X32 is actually sending
- Reconnecting the app restores correct values (confirms it's a keepalive failure, not a data model bug)

**Phase to address:** X32/OSC monitor mixing phase — must be in proxy server design from day one, not retrofit later.

---

### Pitfall 2: X32 Doesn't Echo Back Its Own OSC-Commanded Changes

**What goes wrong:**
When a browser client sends an OSC fader command to the X32, the X32 processes the command but does NOT send the change back via the `/xremote` stream. Only changes initiated from the physical desk or other clients get echoed. This means if musician A moves their monitor fader from the app, musician A's own app UI will not receive confirmation. The UI shows the value the user dragged to, but there's no authoritative confirmation from the mixer that it was received.

**Why it happens:**
The X32's OSC implementation deliberately suppresses echoing commands back to the originating client, presumably to prevent feedback loops. Developers assume bidirectional sync — "I send it, I receive it" — which is wrong.

**How to avoid:**
The proxy server must implement local state echo: when a command is sent to the X32, immediately broadcast that command to all connected WebSocket clients (including the originator) so every client's UI updates. This creates a "local optimistic update + proxy broadcast" pattern. Also implement full state sync on connect by polling all fader and mute states before the first `/xremote` (the X32 won't send current state automatically on subscription).

**Warning signs:**
- One musician's slider doesn't update when another musician moves a fader via the app
- On reconnect, fader positions snap to unexpected values
- Physical desk changes reflect in app but app-initiated changes don't

**Phase to address:** X32 proxy architecture phase — must be in the proxy design spec before any client code is written.

---

### Pitfall 3: No UDP in Browsers Forces Proxy Architecture — Proxy Becomes Single Point of Failure

**What goes wrong:**
Browsers cannot send UDP packets. The X32 communicates exclusively over UDP on port 10023. This means there is no path from browser → X32 without a server-side proxy. The Electron-based v1 bridge failed in production; a naive replacement (Node.js script running on someone's laptop) introduces a new single point of failure. If the proxy crashes, goes offline, or isn't started before the service, all monitor mixing dies.

**Why it happens:**
The architectural constraint (UDP gap) is clear, but teams underestimate the operational complexity of running a persistent proxy in a real venue. Someone has to start it, keep it running, and know what to do when it fails.

**How to avoid:**
Run the proxy as a persistent process on the network — either on a dedicated device at the venue (Raspberry Pi, NUC) or as a cloud process if latency allows. Use a process manager (PM2) so it auto-restarts on crash. Build a visible connection status indicator in the app (proxy reachable / X32 reachable / mixer synced) so musicians know immediately when the system is degraded. Design graceful degradation: the app must remain fully functional for setlist/sheet music use even when the X32 proxy is unavailable.

**Warning signs:**
- Monitor mixing only works "when X is running" on someone's personal machine
- No connection status visible to musicians
- Musicians can't tell if their fader changes are taking effect

**Phase to address:** Monitor mixing foundation phase — proxy hosting strategy must be decided before implementation.

---

### Pitfall 4: Stale Setlist Data Served From Cache During Live Service

**What goes wrong:**
A musician opens the app at the start of a service. The service worker serves the cached setlist from the previous week because the network-first strategy wasn't properly implemented for setlist documents. The musician performs the wrong songs, in the wrong order, possibly in the wrong key. This is the catastrophic failure case for this app — worse than the app crashing, because the failure is invisible.

**Why it happens:**
PWA service workers default to cache-first for performance. Developers test online and see fresh data. The cache-first path only triggers when the device is offline or the network is slow — exactly the conditions in a venue. Firestore's offline persistence adds another layer: the Firestore local cache can serve stale documents even when technically online if the listener hasn't reconnected yet.

**How to avoid:**
Use network-first (not cache-first) for all setlist and song library data. On app open, force a Firestore `getDocumentsFromServer()` call for the active setlist before rendering — block the UI with a loading state rather than risk showing stale data. Implement explicit cache versioning: when the rabbi publishes a setlist, increment a version timestamp in Firestore that clients check against their cached version on startup. If versions differ, invalidate and refetch before proceeding.

**Warning signs:**
- Musicians report seeing "last week's setlist" in the app
- Song order or key assignments look wrong on phones but correct on the admin's desktop
- App shows correct data after a force-refresh but wrong data on cold load

**Phase to address:** Offline reliability phase — define the cache invalidation strategy before implementing offline caching.

---

### Pitfall 5: "Big Bang" Component Rewrite Breaks Working Features

**What goes wrong:**
The developer decides to rebuild all 157 components from scratch simultaneously. Three weeks in, the app is in a half-rebuilt state with neither the v1 features (fully working) nor the v2 features (complete). The rabbi can't use it for Saturday services. The setlist-first rebuild becomes a regression machine.

**Why it happens:**
The temptation is to "start clean" — it feels right to delete all the old components and build the new ones correctly. But with a single developer, no staging environment, and real services every week, the "everything breaks in the middle" phase is unacceptable.

**How to avoid:**
Adopt a strangler fig pattern: keep the existing v1 routes alive and functional while building new v2 routes in parallel under different URL paths (e.g., `/v2/service/[id]`). Ship one complete vertical slice (setlist view) end-to-end in v2 before touching any other feature. Only cut over a v1 feature to v2 once the v2 replacement is complete and tested at an actual service. Never delete v1 code until v2 replacement has been used successfully at least twice.

**Warning signs:**
- "I'll clean up the old code after I finish the new stuff" (the old code never gets cleaned)
- Multiple half-finished screens that aren't usable
- Testing against the dev build rather than verifying at actual Shabbat services

**Phase to address:** UI rebuild foundation phase — define the cutover strategy before writing the first component.

---

### Pitfall 6: Google Drive Webhook Channels Expire Silently

**What goes wrong:**
The Google Drive webhook channel (used to trigger sync when new sheet music is added) has a maximum lifetime and must be renewed before expiry. Google sends no warning when a channel is about to expire — it simply stops sending notifications. The app appears to work fine; new PDFs added to Drive just never show up in the app. This can go unnoticed for days or weeks.

**Why it happens:**
Drive's push notification API creates channels with an expiration timestamp (typically 1 week maximum). Developers test the initial setup, see notifications working, and don't implement renewal. Renewal is non-obvious: renewing creates a *new* channel ID, not an extension of the existing one, which can create a gap in coverage if not timed correctly.

**How to avoid:**
Use the existing Vercel cron job infrastructure to check channel expiration daily and proactively renew channels that are within 24 hours of expiry. Implement a fallback polling mechanism (the existing hourly cron) that runs even when webhooks are active — webhooks become the fast path, polling is the safety net. Store the channel expiry timestamp in Firestore and monitor it.

**Warning signs:**
- New PDFs added to Drive don't appear in the app but existing ones still work
- Last sync timestamp in Firestore is days old while new files exist in Drive
- Musicians report "the new song isn't in the app" after the rabbi uploaded it

**Phase to address:** Drive sync hardening phase — must be addressed before v2 goes live for regular use.

---

### Pitfall 7: Firestore Real-Time Listeners Leak on Mobile and Kill Battery

**What goes wrong:**
Firestore `onSnapshot` listeners are opened in React components but not cleaned up when the component unmounts. On a mobile phone during a service, the musician navigates between screens — setlist view, sheet music view, monitor mix — and each navigation leaves zombie listeners open. After 20 minutes, the phone is hot, battery is draining at 3x normal rate, and the app is sluggish. In the worst case, redundant listeners on the same Firestore path cause duplicate UI updates that appear as flickering or double-rendering.

**Why it happens:**
React's `useEffect` cleanup is easy to forget, especially when listeners are set up in multiple layers of a component tree. The Next.js App Router's Server/Client component split adds additional complexity: Firestore listeners must be in `'use client'` components, and developers sometimes duplicate them across parent and child components.

**How to avoid:**
Every `onSnapshot` call must have a corresponding unsubscribe in the `useEffect` return function — enforce this with an ESLint rule or code review checklist. Centralize Firestore listeners in a small number of context providers (aligned with the 2-3 Zustand store consolidation), never open listeners in leaf components. Test with Chrome DevTools → Performance tab during a simulated 30-minute session and verify listener count stays constant.

**Warning signs:**
- Phone gets warm during the service
- React DevTools shows more active listener hooks than expected
- Navigating back and forth between screens causes data to flash or duplicate

**Phase to address:** State management consolidation phase — design the listener architecture before building any screen.

---

### Pitfall 8: Bus Factor 1 — App Becomes Unusable If Daniel Is Unavailable

**What goes wrong:**
The rabbi/developer is the only person who understands the codebase, holds all credentials, and can make changes. A week before High Holidays, he has a family emergency. No one else can update the setlist app, rotate expired API keys, renew the Google Drive webhook channel, restart the crashed X32 proxy, or even log into the admin panel if his Google account has an issue.

**Why it happens:**
Solo developers naturally accumulate single points of failure — it's faster to just "know where things are" than to document them. The small user base (10-15 people, all trusted) creates a false sense of security.

**How to avoid:**
Create a "Service Day Runbook" document shared with at least one other person (sound engineer is the best candidate) that covers: how to restart the X32 proxy, how to check if sync is working, what to do if the app won't load, and who to call. Store all credentials in a shared password manager (not just in the developer's head). Design the app so that the sound engineer can handle the most critical operational tasks (proxy restart, force sync) without needing code access. Write this runbook before going live for regular services.

**Warning signs:**
- "I'll add that to the docs later"
- Credentials stored only in the developer's browser or personal 1Password vault
- No one else on the team has ever successfully performed a common operational task

**Phase to address:** Operations/deployment phase — runbook should exist before the first production service.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip X32 proxy connection status UI | Faster to ship | Musicians can't tell if monitor mixing is broken; debug calls mid-service | Never — build it in the first pass |
| Use cache-first for all PWA assets including setlist data | Faster perceived load | Wrong setlist served at live service | Never for dynamic setlist data; fine for app shell |
| Keep all 8 Zustand stores as-is during rebuild | Less migration work now | Cross-store dependencies cause subtle bugs as new components are added | Acceptable if stores are truly isolated; not if they share state |
| Run X32 proxy manually before each service | Simpler than a persistent process | Proxy forgotten → no monitor mixing for entire service | Never — automate the proxy startup |
| Defer Drive webhook renewal logic | Faster initial implementation | New sheet music silently stops syncing | Acceptable for first week, must address within first month |
| Use `'use client'` on every component to avoid SSR issues | Eliminates hydration errors quickly | Inflated client bundle, poor mobile performance | Acceptable as temporary measure during rapid UI build; refactor after |
| Skip unsubscribe in useEffect for "simple" components | Saves a line of code | Memory leaks, battery drain on musicians' phones during services | Never |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| X32 OSC via WebSocket proxy | Keeping keepalive in browser client | Keepalive (`/xremote` every 8s) lives in proxy server, not browser |
| X32 OSC | Assuming initial connect gives current state | Must actively poll all fader/mute values on first connect; `/xremote` only gives future changes |
| X32 OSC | Using `0.0.0.0` as UDP bind address | Must use a specific reachable interface address; `0.0.0.0` breaks X32 compatibility |
| X32 OSC | Ignoring binary blob format for meter data | `/meters` returns raw `ArrayBuffer`, not standard OSC types; requires custom parsing |
| X32 OSC | Assuming commands echo back to sender | X32 suppresses echoing its own OSC commands back; proxy must implement local broadcast |
| Google Drive webhooks | Assuming channel persists indefinitely | Channels expire (max ~1 week); implement proactive renewal via cron |
| Google Drive webhooks | Processing notifications without deduplication | `pageToken` race conditions cause duplicate Firestore writes on bulk Drive changes |
| Firestore offline | Testing only with good connectivity | Test explicitly with DevTools → Network → Offline; Firestore cache behavior differs significantly |
| Firestore offline | Using whole-document overwrites for setlist updates | Use field-level updates (`updateDoc` with specific fields) to avoid collision overwrites |
| Google Drive API | No fallback when webhook channel is expired | Maintain hourly polling cron as safety net independent of webhook status |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Firestore listener per leaf component | Phone overheats during service, battery drains fast | Centralize listeners in context providers; deduplicate across components | Immediately visible at 5+ screens with listeners |
| Cache-first for all service worker requests | Musicians see last week's setlist at service | Network-first for Firestore-backed data; cache-first only for static app shell | First time a musician shows up to service after a setlist update |
| No UDP buffer management on X32 WiFi | Fader position updates drop on 2.4GHz networks | Use 5GHz network for X32; implement acknowledgment patterns in proxy | When more than 2-3 musicians adjust monitors simultaneously |
| Polling all 32 channels every 50ms (subscribe mode) | X32 connection saturates WiFi bandwidth | Use event mode (`/xremote`) + subscribe only for active channels | With 8+ concurrent musicians all polling |
| Re-running Google Drive full sync on every startup | Slow app startup; Drive API quota consumed | Delta sync using `pageToken`; full sync only on first install or explicit user action | Immediately if library grows beyond ~50 songs |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing X32 OSC WebSocket proxy to public internet | Anyone can take control of the sanctuary's audio system; no authentication in OSC protocol | Proxy must be LAN-only or behind VPN; never expose on public port without auth |
| Storing Google Drive OAuth tokens in Firestore without field-level security rules | Compromised musician account could read admin Drive tokens | Store service account credentials only in Vercel environment variables, never in Firestore |
| No Firestore security rules validation on setlist writes | Any authenticated user (member role) could corrupt setlist data | Rules must enforce role-based write access: only `leader` or `admin` role can write setlists |
| X32 proxy accepting connections from all WebSocket clients | Any device on the venue WiFi could send mixer commands | Proxy should validate a shared secret (even a simple token in the connection header) from app clients |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Font too small in setlist view on phone | Musicians squint or miss cues during performance; looking at phone instead of ensemble | Minimum 24pt song title, 18pt key/tempo info; no more than 3-4 data points visible at once |
| No dark mode for stage use | Screen glare in dimly lit sanctuary; musicians distracted | Implement dark mode before first service; worship spaces are almost always lower-light |
| Setlist app requires WiFi to function at all | App fails in venues with poor WiFi coverage | All setlist data and charts must be proactively cached before service; offline = paper fallback |
| No visual indicator when monitor mixing is disconnected | Musician adjusts monitor fader, nothing happens, assumes it worked | Persistent connection status indicator in monitor mix view; disabled controls when disconnected |
| Auto-transposition shows wrong key during live performance | Musician plays in wrong key for first measure; embarrassing | Key must be the largest, most prominent element in the setlist view; auto-transposition must be per-musician setting applied at render time, not an on-demand action |
| Substitute musician can't access the app | Last-minute sub shows up without charts or setlist access | New users must be able to get access within 5 minutes; onboarding must work on mobile without desktop |
| No "next song" preview while current song is playing | Musician can't prepare for the transition; awkward pauses | Show upcoming song title and key in a persistent footer or swipe-preview |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **X32 monitor mixing:** Often appears to work in testing because developer is on LAN with perfect conditions — verify on venue WiFi with 8 concurrent musicians and 2.4GHz congestion
- [ ] **Offline setlist access:** Often appears to work because Firestore cache serves data — verify by explicitly killing network before app load (not after); test cold start offline
- [ ] **Auto-transposition:** Often appears correct for common instruments — verify Eb alto sax, Bb trumpet, F horn, and capo offsets for guitarists; edge cases break music
- [ ] **PWA installability:** Adding to home screen and service worker registration may succeed but the installed app may still break on iOS Safari — test installed PWA specifically, not just browser
- [ ] **Role-based access:** Admin role may work correctly but member-role users creating setlists or accessing other musicians' transposition settings indicates a rules gap — verify Firestore security rules with the emulator
- [ ] **Google Drive sync:** New files appear in the Drive folder — verify they actually appear in the app within the expected time window (not just "eventually"); check sync timestamps in Firestore
- [ ] **Real-time setlist updates:** Leader publishes a setlist change — verify that all open musician apps update within seconds without requiring a manual refresh
- [ ] **Setlist published notification:** App shows a notification badge — verify the notification actually arrives even when the app is in the background (PWA push notification, not just in-app state)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| X32 keepalive failure mid-service | LOW | Restart X32 proxy; musicians re-open monitor mix screen; 2-minute disruption |
| Stale setlist served at service | MEDIUM | Sound engineer pulls up setlist on admin desktop; rabbi announces changes verbally; app trust damaged |
| Google Drive webhook stopped syncing | LOW | Run manual cron trigger via Vercel dashboard; re-register webhook channel; no data loss |
| Firestore listener memory leak causing phone slowdown | MEDIUM | App restart clears listeners; requires code fix before next service |
| Big Bang rewrite: app broken for a service | HIGH | Roll back to v1 if still available; if v1 code deleted, emergency session to restore core setlist view; services disrupted |
| Bus factor: developer unavailable before service | HIGH | Sound engineer restarts X32 proxy from runbook; rabbi uses Google Doc fallback for setlist; no app-specific recovery without developer |
| Google Drive OAuth token rotation needed | MEDIUM | Vercel env var update + redeployment; 15-minute outage for Drive sync; setlist data unaffected |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| X32 keepalive expiry | X32 OSC proxy foundation | Run proxy for 30+ minutes; confirm `/xremote` is re-sent automatically; confirm fader updates continue after 10s |
| X32 no self-echo | X32 OSC proxy foundation | Send fader command from browser; verify originating browser UI updates immediately via proxy broadcast |
| UDP proxy as SPOF | X32 proxy deployment design | Proxy survives process restart via PM2; connection status visible in app; app functions for setlist use when proxy is down |
| Stale setlist from cache | Offline reliability phase | Test cold-start offline after setlist update; verify version mismatch triggers refetch |
| Big bang component rewrite | UI rebuild foundation | Define strangler fig cutover plan; v1 routes remain live until v2 replacement has been used at 2 services |
| Drive webhook expiry | Drive sync hardening | Deploy cron that checks channel expiry; add new file to Drive; verify it appears in app within 15 minutes |
| Firestore listener leaks | State management consolidation | Verify listener count in React DevTools stays constant through 10 minutes of navigation; no battery anomaly |
| Bus factor | Operations/runbook phase | Sound engineer successfully completes proxy restart from runbook without developer assistance |
| Firestore security rules gaps | Auth + data model phase | Run Firebase emulator security rules tests; verify member role cannot write setlists |
| PWA cache serving stale data | Offline reliability phase | Chrome DevTools → Application → Cache Storage; confirm setlist data uses network-first strategy |

---

## Sources

- [x32-proxy: UDP and WebSocket proxy for Behringer/Midas](https://github.com/audiopump/x32-proxy) — HIGH confidence; official open-source implementation
- [Behringer X32 OSC Remote Protocol (official wiki)](https://behringerwiki.musictribe.com/index.php?title=OSC_Remote_Protocol) — HIGH confidence; official documentation
- [Behringer X32 OSC is Quirky — Janis Streib's Blog](https://janis-streib.de/post/behringer-x32-osc-is-quirky/) — MEDIUM confidence; practitioner post with specific protocol quirks verified against official docs
- [Unofficial X32/M32 OSC Remote Protocol PDF](https://tostibroeders.nl/wp-content/uploads/2020/02/X32-OSC.pdf) — HIGH confidence; widely referenced community protocol reference
- [Firebase: Access data offline (official)](https://firebase.google.com/docs/firestore/manage-data/enable-offline) — HIGH confidence; official Firebase documentation
- [Firestore real-time queries at scale (official)](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) — HIGH confidence; official Firebase documentation
- [Google Drive API: Push notifications / webhooks (official)](https://developers.google.com/workspace/drive/api/guides/push) — HIGH confidence; official Google documentation
- [Service workers that don't surprise you — DEV Community](https://dev.to/crisiscoresystems/service-workers-that-dont-surprise-you-deterministic-caching-for-offline-first-pwas-5480) — MEDIUM confidence; practitioner post
- [When 'Just Refresh' Doesn't Work: Taming PWA Cache Behavior](https://iinteractive.com/resources/blog/taming-pwa-cache-behavior) — MEDIUM confidence; real-world post-mortem with production Safari caching bugs
- [Firestore: setDoc not updating local cache when offline (GitHub issue #8696)](https://github.com/firebase/firebase-js-sdk/issues/8696) — HIGH confidence; official SDK issue tracker
- [Firebase: FR: Be able to invalidate offline data (GitHub issue #1180)](https://github.com/firebase/firebase-ios-sdk/issues/1180) — HIGH confidence; official SDK issue tracker confirming cache invalidation gap
- [Google Drive webhooks only send initial sync, never update (Developer forums)](https://discuss.google.dev/t/google-drive-webhooks-only-send-the-initial-sync-never-update-am-i-missing-something-obvious/288347) — MEDIUM confidence; confirmed real-world production failures
- [State Management in 2025: Context, Redux, Zustand, Jotai](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k) — MEDIUM confidence; practitioner survey
- [Zustand with Next.js App Router — Medium](https://medium.com/@mak-dev/zustand-with-next-js-14-server-components-da9c191b73df) — MEDIUM confidence; implementation guide
- [Bus Factor: The grim math of single points of failure](https://iambenschmidt.com/blog/2025/the-bus-factor-the-grim-math-of-single-points-of-failure/) — MEDIUM confidence; practitioner analysis
- [Worship Team Apps: The 7 Best for Planning and Performance](https://worshiponline.com/worship-team-apps/) — MEDIUM confidence; domain UX survey

---
*Pitfalls research for: Worship music setlist + X32 monitor mixing PWA (CRC Music v2.0 brownfield rewrite)*
*Researched: 2026-03-07*
