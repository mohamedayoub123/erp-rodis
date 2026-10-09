"use client";

import { useActionState } from "react";
import { enregistrerProductionRealiseeAction, type EtatSaisie } from "./actions-rapport";

export type MoisSaisissable = {
  // "2026-06"
  cle: string;
  // "Juin 2026"
  libelle: string;
  valeur: number | null;
  // vrai si le chiffre actuel a ete saisi dans l'ERP (donc corrigeable) ; faux = mois sans chiffre
  saisi: boolean;
};

function LigneMois({ code, mois }: { code: string; mois: MoisSaisissable }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(enregistrerProductionRealiseeAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="mois" value={mois.cle} />
      <span className="w-32 text-sm font-medium text-slate-800">{mois.libelle}</span>
      <input
        name="pourcentage"
        inputMode="decimal"
        defaultValue={mois.valeur ?? ""}
        placeholder="ex : 92"
        aria-label={`Production réalisée de ${mois.libelle} en pourcentage`}
        className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
      />
      <span className="text-sm text-slate-500">%</span>
      <button
        type="submit"
        disabled={enCours}
        className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
      >
        {enCours ? "..." : mois.saisi ? "Corriger" : "Enregistrer"}
      </button>
      {etat ? <span className={`text-sm ${etat.ok ? "text-emerald-700" : "text-rose-700"}`}>{etat.message}</span> : null}
    </form>
  );
}

// Saisie de la production realisee (%) des mois sans chiffre (et correction des mois deja saisis). Visible sur la
// page seulement (jamais dans le diaporama ni le PowerPoint).
export function SaisieProduction({ code, mois, ouvert }: { code: string; mois: MoisSaisissable[]; ouvert: boolean }) {
  if (mois.length === 0) return null;
  return (
    <details data-hors-diapo open={ouvert} className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Saisir la production réalisée d&apos;un mois
        {ouvert ? <span className="ml-2 font-normal text-amber-700">({mois.filter((m) => !m.saisi).length} mois sans chiffre)</span> : null}
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Le chiffre saisi remplace les autres sources de ce mois dans le graphique et dans le PowerPoint.
      </p>
      <div className="mt-3 space-y-2">
        {mois.map((m) => (
          <LigneMois key={m.cle} code={code} mois={m} />
        ))}
      </div>
    </details>
  );
}
