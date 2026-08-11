"use client";

import Link from "next/link";

// Sans ce fichier, une erreur non geree dans une Server Action ou un rendu
// de page affichait l'ecran generique Next.js "This page couldn't load /
// A server error occurred" - aucun message, impossible de savoir quoi
// corriger. Ce boundary affiche le vrai message d'erreur a la place.
//
// unstable_retry (pas reset) pour le bouton "Reessayer" : sur cette version
// de Next.js, reset() se contente de reafficher le meme arbre deja en
// memoire SANS recontacter le serveur - le bouton semblait ne jamais rien
// faire (meme message a l'infini). unstable_retry() refait vraiment la
// requete.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-black/5 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <p className="inline-flex rounded-full bg-red-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-900">
          ERP Rodis
        </p>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-950">
          Une erreur s&apos;est produite
        </h1>
        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error.message || "Erreur inconnue."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={unstable_retry}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Reessayer
          </button>
          <Link
            href="/"
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
          >
            Retour accueil
          </Link>
        </div>
      </section>
    </main>
  );
}
