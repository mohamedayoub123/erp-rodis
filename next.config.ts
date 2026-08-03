import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin dev requests by default - accessing the dev
  // server via the LAN IP (not localhost) needs this, or the JS bundle
  // loads but hydration/interactivity silently fails.
  allowedDevOrigins: ["192.168.4.62"],
  // Sans ceci, Turbopack devine la racine du projet en remontant a la
  // recherche d'un lockfile - si un package-lock.json trainait plus haut
  // (ex: directement dans le profil utilisateur Windows), Turbopack prenait
  // ce dossier comme racine et le CSS ne se chargeait plus. __dirname fixe
  // toujours la racine sur ce projet, quelle que soit la machine.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
