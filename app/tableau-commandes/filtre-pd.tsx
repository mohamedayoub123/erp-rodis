"use client";

import { libellePd, type PdDuType } from "@/lib/programme-en-cours-par-pd";

// Filtre "Programme en cours : PD" des pages Commandes par type et Stock restant par type : un bouton par PD (seulement les PD qui contiennent des
// articles du type choisi, avec du programme en cours). Les PD cochés sont ceux qui comptent : le programme en cours, le reste a fabriquer et le
// stock restant sont recalcules avec le programme en cours de ces PD seulement. Au depart tous les PD sont coches (rien ne change tant qu'on ne filtre pas).

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function FiltrePd({
  pds,
  choisis,
  onChange,
}: {
  pds: PdDuType[];
  choisis: Set<string>;
  onChange: (suivant: Set<string>) => void;
}) {
  if (pds.length === 0) return null;

  function basculer(cle: string) {
    const suivant = new Set(choisis);
    if (suivant.has(cle)) suivant.delete(cle);
    else suivant.add(cle);
    onChange(suivant);
  }

  const tous = choisis.size === pds.length;
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Programme en cours : choisis les PD</p>
          <p className="mt-1 text-xs text-slate-500">
            Seulement les PD qui contiennent des articles de ce type. Le programme en cours, le reste a fabriquer et le stock restant ne comptent que les PD
            coches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className={`rounded-full px-3 py-1 ${tous ? "bg-slate-100 text-slate-600" : "bg-teal-100 text-teal-800"}`}>
            {choisis.size} PD sur {pds.length}
          </span>
          <button
            type="button"
            onClick={() => onChange(new Set(pds.map((pd) => pd.cle)))}
            disabled={tous}
            className="rounded-full border border-slate-300 px-3 py-1 text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-default disabled:opacity-40"
          >
            Tous les PD
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            disabled={choisis.size === 0}
            className="rounded-full border border-slate-300 px-3 py-1 text-slate-700 hover:border-red-500 hover:text-red-600 disabled:cursor-default disabled:opacity-40"
          >
            Aucun PD
          </button>
        </div>
      </div>
      <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
        {pds.map((pd) => {
          const actif = choisis.has(pd.cle);
          return (
            <button
              key={pd.cle}
              type="button"
              onClick={() => basculer(pd.cle)}
              aria-pressed={actif}
              title={`${libellePd(pd.cle)} : ${pd.articles} articles de ce type, ${formater(pd.cartons)} cartons en cours`}
              className={`rounded-2xl border px-3 py-1.5 text-sm font-bold shadow-sm transition ${
                actif ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:border-teal-500"
              }`}
            >
              <span aria-hidden="true">{actif ? "✓ " : ""}</span>
              {libellePd(pd.cle)}
              <span className={`ml-2 text-xs font-medium ${actif ? "text-white/80" : "opacity-70"}`}>
                {pd.articles} art. - {formater(pd.cartons)} cartons
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
