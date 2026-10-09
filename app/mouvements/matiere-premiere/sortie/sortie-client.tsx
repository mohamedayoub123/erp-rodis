"use client";

import { useEffect, useState } from "react";
import { SortiePanelMp, type ArticleMpOption, type LotBalanceMpOption } from "../staged-movements-mp";
import { chargerLotsSortieMpAction } from "../actions";

export function SortieMpClient({
  articles,
  canWrite,
}: {
  articles: ArticleMpOption[];
  canWrite: boolean;
}) {
  // Les lots (soldes par article + lot) arrivent apres l'ouverture de la page : le formulaire est utilisable tout
  // de suite, le champ Lot indique "Chargement..." le temps qu'ils arrivent.
  const [lots, setLots] = useState<LotBalanceMpOption[] | null>(null);
  const [erreurLots, setErreurLots] = useState("");

  useEffect(() => {
    if (!canWrite) return;
    let annule = false;
    chargerLotsSortieMpAction()
      .then((reponse) => {
        if (annule) return;
        if (reponse.ok) setLots(reponse.lots);
        else {
          setErreurLots(reponse.message);
          setLots([]);
        }
      })
      .catch(() => {
        if (annule) return;
        setErreurLots("chargement impossible");
        setLots([]);
      });
    return () => {
      annule = true;
    };
  }, [canWrite]);

  if (!canWrite) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="text-lg font-bold text-slate-900">Lecture seule</p>
        <p className="mt-2 text-sm text-slate-600">
          Le formulaire de sortie est cache pour cet utilisateur.
        </p>
      </div>
    );
  }

  return (
    <SortiePanelMp
      articles={articles}
      mode="normal"
      lots={lots ?? []}
      lotsEnChargement={lots === null}
      lotsErreur={erreurLots}
    />
  );
}
