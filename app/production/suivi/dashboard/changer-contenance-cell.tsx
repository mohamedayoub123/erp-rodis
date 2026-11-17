"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changerContenanceLigneAction } from "./contenance-actions";

// Colonne "Produit" du Conditionnement (Dashboard) : le nom du produit + un petit bouton "Changer" pour passer a une autre contenance du
// MEME vrac (ex : LAIT WHITE SECRET 500ML -> 200ml ou 300ML). Les cartons prevus sont recalcules. Refuse par le serveur des que des
// cartons / de l'emballage sont saisis ou que le Besoin est valide.
export function ChangerContenanceCell({
  ligneId,
  produit,
  articleId,
  options,
  lotsConcernes,
  lotsGardes,
}: {
  ligneId: number;
  produit: string;
  articleId: number;
  options: { id: number; label: string }[];
  // lots qui changent de contenance / lots deja commences qui gardent la leur (ils restent sur la ligne d'origine)
  lotsConcernes: string[];
  lotsGardes: string[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(articleId);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function valider() {
    const cible = options.find((o) => o.id === choix);
    if (!cible || choix === articleId) {
      setMessage("Choisis une autre contenance.");
      return;
    }
    const texteConfirmation =
      lotsGardes.length > 0
        ? `Passer les lots ${lotsConcernes.join(", ")} en ${cible.label} ? Ils passent sur une NOUVELLE ligne et leurs cartons prevus sont recalcules. ${lotsGardes.join(", ")} reste en ${produit} (deja commence).`
        : `Passer ${produit} en ${cible.label} ? Les cartons prevus de cette ligne seront recalcules.`;
    if (!window.confirm(texteConfirmation)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await changerContenanceLigneAction(ligneId, choix);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        setOuvert(false);
        router.refresh();
      } catch {
        setMessage("Changement impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span>{produit || "-"}</span>
      {!ouvert ? (
        <button
          type="button"
          onClick={() => {
            setChoix(articleId);
            setMessage(null);
            setOuvert(true);
          }}
          className="w-fit rounded-full border border-dashed border-sky-300 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
        >
          Changer la contenance
        </button>
      ) : (
        <div className="flex flex-col gap-1 rounded-xl border border-sky-200 bg-white p-2 shadow-sm">
          <select
            value={choix}
            onChange={(evenement) => setChoix(Number(evenement.target.value))}
            className="max-w-[16rem] rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.id === articleId ? " (actuel)" : ""}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={valider}
              disabled={enCours}
              className="rounded bg-sky-700 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {enCours ? "..." : "OK"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOuvert(false);
                setMessage(null);
              }}
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {message ? <span className="max-w-[16rem] text-xs font-semibold text-red-600">{message}</span> : null}
    </div>
  );
}
