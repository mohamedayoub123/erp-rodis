import {
  FAMILLES_SANS_EAU,
  LIBELLES_SANS_EAU,
  DEBIT_OSMOSE_LITRES_HEURE,
  PART_EAU_PAR_LIGNE,
  calculerElectriciteDuMois,
  coutElectriciteDuMois,
  type CartonsDuMois,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { libelleMois } from "@/lib/cout-eau";
import type { ParametresElectricite } from "./data";

function nombre(value: number, decimales = 0) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

// Eau et electricite utilisees dans le mois : calculees toutes seules (rien a
// saisir) a partir des quantites du Rapport Test labo. Les produits sans eau sont comptes mais ne
// generent ni eau ni electricite.
export function EauAutomatique({
  annee,
  mois,
  eau,
  cartons,
  erreur,
  parametres,
}: {
  annee: number;
  mois: number;
  eau: EauDuMois | null;
  cartons: CartonsDuMois | null;
  erreur: string | null;
  parametres: ParametresElectricite;
}) {
  const electricite = eau
    ? calculerElectriciteDuMois(eau.litres, parametres.ligne1, parametres.ligne2)
    : null;
  const coutElectricite = electricite
    ? coutElectriciteDuMois(electricite, parametres.ligne1.prixKwh, parametres.ligne2.prixKwh)
    : null;

  return (
    <section className="rounded-[1.75rem] border border-sky-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">
          Quantites, eau et electricite de {libelleMois(annee, mois)} (automatique)
        </h2>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Calcul automatique</span>
      </div>

      {erreur || !eau ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Les quantites du Test labo n&apos;ont pas pu etre lues{erreur ? ` (${erreur})` : ""}. Recharge la page.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantite du mois (Test labo)</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{nombre(eau.kgTotal, 1)} kg</p>
              <p className="mt-1 text-xs text-slate-500">{eau.nombreEntrees} preparation(s) du Test labo</p>
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

          {cartons ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cartons du mois (Test labo)
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">{nombre(cartons.total, 1)} cartons</p>
                <p className="mt-1 text-xs text-slate-500">{cartons.nombreEntrees} preparation(s) du Test labo</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dont produits sans eau
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">{nombre(cartons.sansEau, 1)} cartons</p>
                <p className="mt-1 text-xs text-slate-500">
                  {FAMILLES_SANS_EAU.map((famille, index) => (
                    <span key={famille}>
                      {index > 0 ? " - " : ""}
                      {LIBELLES_SANS_EAU[famille]} {nombre(cartons.parFamille[famille], 1)}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ) : null}

          {electricite ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Electricite</th>
                    <th className="px-4 py-3 font-semibold">Eau de la ligne</th>
                    <th className="px-4 py-3 font-semibold">Debit osmose</th>
                    <th className="px-4 py-3 font-semibold">Consommation</th>
                    <th className="px-4 py-3 font-semibold">Heures de marche</th>
                    <th className="px-4 py-3 text-right font-semibold">Electricite</th>
                    <th className="px-4 py-3 text-right font-semibold">Prix du kWh</th>
                    <th className="px-4 py-3 text-right font-semibold">Cout</th>
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
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {nombre(electricite.litres * PART_EAU_PAR_LIGNE, 1)} L
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {nombre(DEBIT_OSMOSE_LITRES_HEURE)} L/h
                        <span className="block text-xs text-slate-500">fixe</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {param.puissanceKw === null ? (
                          <span className="font-semibold text-amber-700">A saisir</span>
                        ) : (
                          <>
                            {nombre(param.puissanceKw, 2)} kW
                            <span className="block text-xs text-slate-500">{param.sourcePuissance}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{calcul ? `${nombre(calcul.heures, 2)} h` : "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-sky-800">
                        {calcul ? `${nombre(calcul.kwh, 1)} kWh` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {param.prixKwh === null ? (
                          <span className="font-semibold text-amber-700">A saisir</span>
                        ) : (
                          `${nombre(param.prixKwh, 2)} FCFA`
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {calcul && param.prixKwh !== null ? `${nombre(calcul.kwh * param.prixKwh)} FCFA` : "-"}
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
                    <td className="px-4 py-3 font-semibold">
                      {electricite.ligne1 || electricite.ligne2 ? `${nombre(electricite.heures, 2)} h` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-black">
                      {electricite.ligne1 || electricite.ligne2 ? `${nombre(electricite.kwh, 1)} kWh` : "-"}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-lg font-black">
                      {coutElectricite === null ? "-" : `${nombre(coutElectricite)} FCFA`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
          {electricite && (!electricite.ligne1 || !electricite.ligne2) ? (
            <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Saisis la consommation (kW) de chaque ligne dans &laquo; Prix des consommables &raquo; (rubrique
              Electricite) : l&apos;electricite d&apos;une ligne n&apos;est calculee qu&apos;avec le chiffre saisi.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Heures de marche = eau de la ligne &divide; debit de l&apos;osmose (9 000 litres par heure, fixe) ; electricite = heures x consommation de la
            ligne. Les litres du mois sont divises par 2 : la moitie pour la Ligne 1, la moitie pour la Ligne 2.
          </p>

          <p className="mt-4 text-sm text-slate-600">
            Quantite des produits qui n&apos;utilisent pas d&apos;eau (comptee, mais sans eau) :{" "}
            {FAMILLES_SANS_EAU.map((famille, index) => (
              <span key={famille}>
                {index > 0 ? " - " : ""}
                <span className="font-semibold text-slate-800">{LIBELLES_SANS_EAU[famille]}</span>{" "}
                {nombre(eau.parFamille[famille], 1)} kg
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Source : les memes chiffres que le Rapport Test labo (preparations passees au Test labo, quantites commandees
            PD de chaque code - vrac en kg et cartons -, comptees selon la date de prise d&apos;echantillon). Ce ne sont pas
            les quantites fabriquees. La consommation (kW) et le prix du kWh de
            chaque ligne se reglent dans &laquo; Prix des consommables &raquo; (rubrique Electricite).
          </p>
        </>
      )}
    </section>
  );
}
