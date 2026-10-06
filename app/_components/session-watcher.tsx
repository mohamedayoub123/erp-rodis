"use client";

import { useEffect, useState } from "react";

// Verifie regulierement que la session de ce navigateur est toujours valide.
// Quand le meme compte se connecte sur un autre ordinateur (ou qu'un admin
// deconnecte l'utilisateur), la page restait affichee comme si de rien n'etait
// mais "Approuver" / "Enregistrer" ne faisaient plus rien, sans message.
// Maintenant un bandeau bloquant l'explique tout de suite et propose de se
// reconnecter. Une erreur reseau ne declenche jamais le bandeau.
// 1 appel serveur par verification : toutes les minutes, et seulement si l'onglet est affiche (un onglet
// cache ne verifie plus ; la verification repart des qu'on y revient, voir plus bas).
const INTERVALLE_MS = 60_000;

type Statut = "ok" | "closed_elsewhere" | "expired" | "none";

export function SessionWatcher() {
  const [statut, setStatut] = useState<Statut>("ok");

  useEffect(() => {
    let arrete = false;

    async function verifier() {
      if (document.visibilityState !== "visible") return;
      try {
        const reponse = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
        if (!reponse.ok) return;
        const data = (await reponse.json()) as { status?: Statut };
        if (!arrete && data.status && data.status !== "ok") setStatut(data.status);
      } catch {
        // reseau coupe ou serveur occupe : on reessaiera
      }
    }

    const minuteur = window.setInterval(verifier, INTERVALLE_MS);
    const auRetour = () => {
      if (document.visibilityState === "visible") void verifier();
    };
    window.addEventListener("focus", auRetour);
    document.addEventListener("visibilitychange", auRetour);

    return () => {
      arrete = true;
      window.clearInterval(minuteur);
      window.removeEventListener("focus", auRetour);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, []);

  if (statut === "ok") return null;

  const message =
    statut === "closed_elsewhere"
      ? "Ton compte s'est connecte sur un autre ordinateur (ou un admin t'a deconnecte). Ce poste est deconnecte."
      : "Ta session a expire.";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-6"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Session fermee</p>
        <p className="mt-3 text-lg font-bold text-slate-950">{message}</p>
        <p className="mt-2 text-sm text-slate-600">
          Ce que tu n&apos;as pas encore enregistre sur cette page n&apos;est pas sauvegarde. Reconnecte-toi pour continuer.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Me reconnecter
        </button>
      </div>
    </div>
  );
}
