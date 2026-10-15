import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { formatMinutes } from "@/lib/suivi-tirage-time";
import { calculerConditionnementMensuel } from "./calcul";

// Rapport Conditionnement mensuel : par mois, combien de machines de conditionnement ont demarre, les heures et les jours
// travailles, le total de cartons et le total de kg produits (voir calcul.ts pour les definitions exactes).
const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "Machines demarrees", key: "machines" },
  { label: "Jours travailles", key: "jours" },
  { label: "Heures travaillees", key: "heures" },
  { label: "Dont arrets (heures)", key: "heuresArrets" },
  { label: "Total cartons", key: "cartons" },
  { label: "Total kg produit", key: "kg" },
  { label: "Cartons sans poids (non comptes en kg)", key: "cartonsSansKg" },
];

function enHeures(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function nombre(valeur: number, decimales = 0) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

export default async function RapportConditionnementMensuelPage() {
  noStore();

  const { lignes, total, nbMachinesConditionnement } = await calculerConditionnementMensuel();

  const exportRows = [...lignes, { ...total, mois: "TOTAL", moisLabel: "TOTAL" }].map((ligne) => ({
    moisLabel: ligne.moisLabel,
    machines: ligne.machines,
    jours: ligne.jours,
    heures: enHeures(ligne.minutesTravaillees),
    heuresArrets: enHeures(ligne.minutesArrets),
    cartons: Math.round(ligne.cartons),
    kg: Math.round(ligne.kg),
    cartonsSansKg: Math.round(ligne.cartonsSansKg),
  }));
  const cartonsSansKgTotal = total.cartonsSansKg;
  // Un mois dans le futur ne peut pas etre une vraie production : date mal saisie (ex : annee 2029) - signale pour correction
  const moisCourant = new Date().toISOString().slice(0, 7);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport Conditionnement Mensuel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Par mois : machines de conditionnement demarrees, heures et jours travailles, total cartons et total kg
                produits.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`rapport-conditionnement-mensuel-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        {lignes.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune saisie de Conditionnement pour le moment.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mois</th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Machines demarrees
                      <span className="block text-xs font-normal text-sky-700">sur {nbMachinesConditionnement} machines</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Jours travailles</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Heures travaillees
                      <span className="block text-xs font-normal text-slate-500">cumul des machines</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Dont arrets
                      <span className="block text-xs font-normal text-slate-500">heures</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">Total cartons</th>
                    <th className="sticky top-0 z-10 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">
                      Total kg produit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => (
                    <tr key={ligne.mois} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {ligne.moisLabel}
                        {ligne.mois > moisCourant ? (
                          <span
                            className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                            title="Ce mois est dans le futur : la date d'une saisie Conditionnement est probablement fausse (mauvaise annee)"
                          >
                            date a verifier
                          </span>
                        ) : null}
                      </td>
                      <td className="bg-sky-50/30 px-4 py-3 font-semibold tabular-nums text-sky-900">{ligne.machines}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{ligne.jours}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700" title={`${nombre(enHeures(ligne.minutesTravaillees), 2)} h`}>
                        {formatMinutes(ligne.minutesTravaillees)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{formatMinutes(ligne.minutesArrets)}</td>
                      <td className="bg-amber-50/30 px-4 py-3 font-semibold tabular-nums text-amber-900">
                        {nombre(ligne.cartons)}
                      </td>
                      <td className="bg-emerald-50/30 px-4 py-3 font-semibold tabular-nums text-emerald-900">
                        {nombre(ligne.kg)}
                        {ligne.cartonsSansKg > 0 ? (
                          <span
                            className="ml-1 text-xs font-normal text-slate-400"
                            title={`${nombre(ligne.cartonsSansKg)} cartons sans poids connu ne sont pas comptes en kg`}
                          >
                            *
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <td className="px-4 py-3 font-bold">TOTAL</td>
                    <td className="px-4 py-3 font-bold tabular-nums" title="Machines differentes, tous mois confondus">
                      {total.machines}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{total.jours}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatMinutes(total.minutesTravaillees)}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatMinutes(total.minutesArrets)}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{nombre(total.cartons)}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{nombre(total.kg)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 text-xs leading-6 text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="font-semibold text-slate-700">Comment c&apos;est calcule</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Machine demarree : une machine (zone + chaine) qui a produit au moins une fois dans le mois.</li>
            <li>Jour travaille : un jour ou au moins une machine a produit.</li>
            <li>
              Heures travaillees : somme des durees entre le demarrage du lot et l&apos;arret du batch de chaque saisie, toutes
              machines cumulees (les arrets declares sont deja dedans).
            </li>
            <li>
              Kg produit : cartons x pieces par carton x poids d&apos;une piece (le poids reel releve en Conditionnement prime sur
              celui de la fiche article).
              {cartonsSansKgTotal > 0
                ? ` ${nombre(cartonsSansKgTotal)} cartons n'ont pas de poids connu : ils sont comptes en cartons mais pas en kg (signales par *).`
                : ""}
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
