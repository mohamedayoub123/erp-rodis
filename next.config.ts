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
    // ATTENTION : staleTimes.dynamic a ete tente ici (30s) pour accelerer
    // la navigation "Retour"/revisite recente, puis retire - regression
    // reelle constatee : redirect() seul (sans revalidatePath explicite,
    // ce que login/logout et la plupart des Server Actions de l'app ne
    // font PAS) ne garantit PAS un rendu frais de la page cible (voir la
    // doc Next elle-meme, node_modules/next/dist/docs/01-app/02-guides/
    // redirecting.md - l'exemple appelle explicitement revalidatePath
    // avant redirect). Consequence reelle : apres connexion, le redirect
    // vers "/" pouvait reafficher la page de connexion mise en cache
    // JUSTE AVANT (login qui semble ne rien faire), l'utilisateur
    // retapait ses identifiants et se faisait bloquer par SA PROPRE
    // session tout juste creee ("deja connecte"). Revenir a staleTimes
    // par defaut (0, aucun cache client) est plus lent mais correct - un
    // audit complet de tous les redirect() de l'app serait necessaire
    // avant de retenter ce genre de cache.
    serverActions: {
      bodySizeLimit: "50mb",
      // Next.js compare l'Origin de la requete au Host attendu avant
      // d'executer une Server Action (protection anti-CSRF) - sans domaine
      // explicite ici, ce controle repose entierement sur la detection
      // automatique du Host, qui peut echouer selon comment Vercel
      // presente ce domaine (X-Forwarded-Host, alias git-branch, etc.),
      // rejetant silencieusement l'action avec un ecran generique.
      allowedOrigins: ["erp-rodis.vercel.app"],
    },
  },
};

export default nextConfig;
