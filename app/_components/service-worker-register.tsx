"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Dev builds rewrite /_next/static/* chunks constantly at the same
    // URLs - caching them (even network-first-for-pages, cache-first-for-
    // static like this worker does) means a browser tab can get stuck
    // forever serving an old build. Only register in production, where
    // static chunks are truly content-hashed/immutable.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installable/offline shell is a bonus, not a requirement - ignore
      // registration failures (e.g. served over plain HTTP on the LAN).
    });
  }, []);

  return null;
}
