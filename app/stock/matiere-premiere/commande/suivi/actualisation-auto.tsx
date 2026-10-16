"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualiserSuivisAction } from "./actions";

// Met a jour le suivi des conteneurs affiches, sans que personne ait a cliquer :
// - a l'ouverture de la page, si certains conteneurs n'ont pas ete mis a jour depuis assez longtemps (ou n'ont pas encore de
//   resultat), le serveur les interroge puis la page se rafraichit toute seule ;
// - tant qu'un conteneur attend son premier resultat, un nouvel essai est fait toutes les 90 secondes (le service met quelques
//   minutes a retrouver l'expedition) ;
// - le bouton "Actualiser le suivi" force une mise a jour (au plus une fois par minute pour chaque conteneur).
export function ActualisationAuto({
  ids,
  enAttente,
  avecBouton = false,
}: {
  ids: number[];
  // Au moins un conteneur n'a pas encore de resultat : on continue d'essayer
  enAttente: boolean;
  avecBouton?: boolean;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [derniere, setDerniere] = useState<string | null>(null);
  const cle = ids.join(",");
  const dejaLance = useRef<string>("");

  function actualiser(forcer: boolean) {
    demarrer(async () => {
      const { interroges } = await actualiserSuivisAction(ids, forcer);
      setDerniere(interroges > 0 ? `${interroges} conteneur(s) mis a jour` : "Rien a mettre a jour pour le moment");
      if (interroges > 0) routeur.refresh();
    });
  }

  useEffect(() => {
    if (ids.length === 0 || dejaLance.current === cle) return;
    dejaLance.current = cle;
    demarrer(async () => {
      const { interroges } = await actualiserSuivisAction(ids, false);
      if (interroges > 0) routeur.refresh();
    });
  }, [cle, ids, routeur]);

  useEffect(() => {
    if (!enAttente || ids.length === 0) return;
    const minuteur = setInterval(() => {
      demarrer(async () => {
        const { interroges } = await actualiserSuivisAction(ids, false);
        if (interroges > 0) routeur.refresh();
      });
    }, 90_000);
    return () => clearInterval(minuteur);
  }, [enAttente, cle, ids, routeur]);

  if (!avecBouton) return null;
  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => actualiser(true)}
        disabled={enCours}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {enCours ? "Mise a jour..." : "Actualiser le suivi"}
      </button>
      {derniere ? <span className="text-xs text-slate-500">{derniere}</span> : null}
    </div>
  );
}
