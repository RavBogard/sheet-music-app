// Tombstone service worker (2026-05-17).
//
// Replaces the legacy serwist PWA on every browser that still has it
// registered. On activate: clears every cache the old worker created,
// claims existing clients, then unregisters itself. After this lands
// on a tab, no service worker controls the page; subsequent requests
// go straight to the network.
//
// Background: the legacy SW + Firestore IDB lifecycle had a recovery-
// loop interaction that caused the "site loads then refreshes within a
// few seconds" bug. Root-cause fix: kill the SW entirely. This file
// (and the matching changes in firebase.ts) is the cleanup pass.
//
// This tombstone ships for ~30 days, then can be deleted entirely. By
// then all returning browsers will have unregistered.

self.addEventListener('install', (event) => {
  // Skip the "installed/waiting" state — go straight to activate so we
  // unregister as quickly as possible.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache created by the previous SW (serwist runtime cache,
    // workbox precache, anything else). Frees stale storage and ensures
    // subsequent network requests aren't intercepted.
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
      // Cache API can throw in restricted-storage contexts (private mode,
      // some embedded webviews). Failing to clear is fine — we still
      // unregister below.
    }
    // Take control of any open clients so this tombstone (not the old
    // SW) is what handles requests for the brief window before unregister.
    try { await self.clients.claim(); } catch {}
    // Self-destruct. From this moment forward the registration is gone;
    // new page loads have no controller.
    try { await self.registration.unregister(); } catch {}
  })());
});

// No fetch handler on purpose — pass every request through to the network.
// Between activate-claim and unregister-complete, this matters: we don't
// want to serve stale anything.
