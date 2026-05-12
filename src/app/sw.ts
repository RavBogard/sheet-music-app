import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// @ts-ignore
declare const self: ServiceWorkerGlobalScope;

// T2.2 (Bug 6, 2026-05-12): dropped `navigationPreload: true`. The previous
// combination of `skipWaiting + clientsClaim + navigationPreload` produced
// two recurring console errors in production:
//   - "Failed to enable or disable navigation preload: The registration
//     does not have an active worker"
//   - "Only the active worker can claim clients"
// Both happen when a method that requires the worker to be in 'activated'
// state is called during 'installing'. `navigationPreload.enable()` is the
// strictest of the three options — it ONLY succeeds against an already-
// active worker — and is also the one with the smallest behavior loss when
// disabled (slightly slower first navigation under SW; defaultCache still
// handles the fallback). Dropping it first is the conservative call.
//
// If the `clientsClaim` error persists after this lands, the next step is
// to also drop `clientsClaim: true` and rely on the controllerchange-
// triggered reload in firebase.ts:151 to propagate SW updates. That trade-
// off would defer user-visible SW updates until the next navigation.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

