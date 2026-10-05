"use client";

import { useRouter } from "next/navigation";
import { MOIS_NOMS, libelleMois } from "@/lib/cout-eau";

// Choix du mois + de l'annee en haut des pages "Eau" : change l'adresse
// (?annee=&mois=) et la page recharge les valeurs de ce mois.
export function SelecteurMois({
  annee,
  mois,
  annees,
  basePath,
  dejaEnregistre,
  repris,
  texteRepris,
}: {
  annee: number;
  mois: number;
  annees: number[];
  basePath: string;
  dejaEnregistre: { par: string | null; le: string } | null;
  // Nom du mois dont les valeurs sont reprises (null = rien de repris)
  repris: string | null;
  // Fin de la phrase quand des valeurs sont reprises
  texteRepris: string;
}) {
  const router = useRouter();

  function choisir(nouvelleAnnee: number, nouveauMois: number) {
    router.push(`${basePath}?annee=${nouvelleAnnee}&mois=${nouveauMois}`);
  }

  return (
    <section className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Mois
          <select
            value={mois}
            onChange={(e) => choisir(annee, Number(e.target.value))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
          >
            {MOIS_NOMS.map((nom, index) => (
              <option key={nom} value={index + 1}>
                {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Annee
          <select
            value={annee}
            onChange={(e) => choisir(Number(e.target.value), mois)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
          >
            {annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-lg font-black text-slate-950">{libelleMois(annee, mois)}</p>
      </div>

      {dejaEnregistre ? (
        <p className="mt-3 text-sm text-slate-700">
          Mois enregistre le {dejaEnregistre.le}
          {dejaEnregistre.par ? ` par ${dejaEnregistre.par}` : ""}.
        </p>
      ) : (
        <p className="mt-3 text-sm font-medium text-amber-800">
          Ce mois n&apos;est pas encore enregistre.
          {repris ? ` ${texteRepris.replace("{mois}", repris)}` : ""}
        </p>
      )}
    </section>
  );
}
