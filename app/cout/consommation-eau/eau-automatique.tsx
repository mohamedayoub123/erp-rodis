import {
  FAMILLES_SANS_EAU,
  LIBELLES_SANS_EAU,
  calculerElectriciteDuMois,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { libelleMois } from "@/lib/cout-eau";
import type { ParametresElectricite } from "./data";

function nombre(value: number, decimales = 0) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Eau et electricite utilisees dans le mois : calculees toutes seules (rien a
// saisir) a partir du vrac fabrique. Les produits sans eau sont comptes mais ne
// generent ni eau ni electricite.
export function EauAutomatique({
  annee,
  mois,
  eau,
  erreur,
  parametres,
}: {
  annee: number;
  mois: number;
  eau: EauDuMois | null;
  erreur: string | null;
  parametres: ParametresElectricite;
}) {
  const electricite = eau
    ? calculerElectriciteDuMois(eau.litres, parametres.ligne1, parametres.ligne2)
    : null;

  return (
    <section className="rounded-[1.75rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">
          Eau et electricite utilisees en {libelleMois(annee, mois)} (automatique)
        </h2>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Calcul automatique</span>
      </div>

      {erreur || !eau ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Les quantites fabriquees n&apos;ont pas pu etre lues{erreur ? ` (${erreur})` : ""}. Recharge la page.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fabrique dans le mois</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{nombre(eau.kgTotal, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">{eau.nombreEntrees} entree(s) de fabrication</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sans eau (non compte)</p>
              <p className="mt-1 text-2xl font-black text-slate-900">- {nombre(eau.kgSansEau, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">Savon, huile, serum, talc</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Base avec eau x {eau.pourcentage} %
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">{nombre(eau.kgAvecEau, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">
                {nombre(eau.kgAvecEau, 1)} x {eau.pourcentage} %
              </p>
            </div>
            <div className="rounded-2xl bg-sky-600 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Eau utilisee</p>
              <p className="mt-1 text-2xl font-black">{nombre(eau.litres, 1)} L</p>
              <p className="mt-1 text-xs text-sky-100">litres du mois</p>
            </div>
          </div>

          {electricite ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Electricite</th>
                    <th className="px-4 py-3 font-semibold">Eau de la ligne</th>
                    <th className="px-4 py-3 font-semibold">Debit machine</th>
                    <th className="px-4 py-3 font-semibold">Consommation</th>
                    <th className="px-4 py-3 font-semibold">Heures de marche</th>
                    <th className="px-4 py-3 text-right font-semibold">Electricite</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Ligne 1", electricite.ligne1, parametres.ligne1],
                      ["Ligne 2", electricite.ligne2, parametres.ligne2],
                    ] as const
                  ).map(([nom, calcul, param]) => (
                    <tr key={nom} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{nom}</td>
                      <td className="px-4 py-3 text-slate-700">{calcul ? `${nombre(calcul.litres, 1)} L` : "-"}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {nombre(param.debitLitresHeure)} L/h
                        <span className="block text-xs text-slate-500">{param.sourceDebit}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {nombre(param.puissanceKw, 2)} kW
                        <span className="block text-xs text-slate-500">{param.sourcePuissance}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{calcul ? `${nombre(calcul.heures, 2)} h` : "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-sky-800">
                        {calcul ? `${nombre(calcul.kwh, 1)} kWh` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-sky-600 text-white">
                    <td className="px-4 py-3 font-bold">Total electricite</td>
                    <td className="px-4 py-3 font-semibold">{nombre(electricite.litres, 1)} L</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 font-semibold">{nombre(electricite.heures, 2)} h</td>
                    <td className="px-4 py-3 text-right text-lg font-black">{nombre(electricite.kwh, 1)} kWh</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Heures de marche = eau de la ligne &divide; debit de la machine ; electricite = heures x consommation de la
            ligne. L&apos;eau du mois est repartie a parts egales entre la Ligne 1 et la Ligne 2.
          </p>

          <p className="mt-4 text-sm text-slate-600">
            Quantite fabriquee des produits qui n&apos;utilisent pas d&apos;eau (comptee, mais sans eau) :{" "}
            {FAMILLES_SANS_EAU.map((famille, index) => (
              <span key={famille}>
                {index > 0 ? " - " : ""}
                <span className="font-semibold text-slate-800">{LIBELLES_SANS_EAU[famille]}</span>{" "}
                {nombre(eau.parFamille[famille], 1)} kg
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Source : vrac fabrique saisi dans Entree production (kg), compte selon la date du jour de fabrication.
            Les lignes exclues des rapports ne sont pas comptees. Le debit de la machine, la consommation et le prix
            du kWh de chaque ligne se reglent dans &laquo; Prix des consommables &raquo; (rubrique Electricite).
          </p>
        </>
      )}
    </section>
  );
}
