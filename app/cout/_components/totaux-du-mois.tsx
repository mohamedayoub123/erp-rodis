import { formaterFcfa, formaterQuantite, unitesCompatibles, type TotalElementAvecPrix } from "@/lib/cout-eau-conso";
import { libelleMois } from "@/lib/cout-eau";

// Total du mois : somme des saisies datees, element par element, avec le prix
// d'une unite (page "Prix des consommables") et le cout (total x prix).
export function TotauxDuMois({
  annee,
  mois,
  totaux,
  sourcePrix,
}: {
  annee: number;
  mois: number;
  totaux: TotalElementAvecPrix[];
  // "ce mois", "repris de ..." ou null (aucun prix saisi)
  sourcePrix: string | null;
}) {
  const coutTotal = totaux.reduce((somme, t) => somme + (t.cout ?? 0), 0);
  const sansPrix = totaux.filter((t) => t.prix === null).length;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Consommation de {libelleMois(annee, mois)}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Total des saisies datees du mois, element par element, avec le prix d&apos;une unite et le cout (total x
          prix).{" "}
          {sourcePrix
            ? `Prix : ${sourcePrix} (page « Prix des consommables »).`
            : "Aucun prix saisi : renseigne-les dans « Prix des consommables »."}
        </p>
      </div>

      {totaux.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Aucune consommation saisie pour ce mois.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="px-5 py-3 font-semibold">Element</th>
                <th className="px-5 py-3 font-semibold">Ligne 1</th>
                <th className="px-5 py-3 font-semibold">Ligne 2</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Unite</th>
                <th className="px-5 py-3 text-right font-semibold">Prix d&apos;une unite (FCFA)</th>
                <th className="px-5 py-3 text-right font-semibold">Cout (FCFA)</th>
                <th className="px-5 py-3 font-semibold">Saisies</th>
              </tr>
            </thead>
            <tbody>
              {totaux.map((t) => (
                <tr key={t.cle} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {t.libelle}
                    {t.auto ? (
                      <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        auto
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{t.auto ? "-" : formaterQuantite(t.ligne1)}</td>
                  <td className="px-5 py-3 text-slate-700">{t.auto ? "-" : formaterQuantite(t.ligne2)}</td>
                  <td className="px-5 py-3 font-semibold text-sky-800">{formaterQuantite(t.total)}</td>
                  <td className="px-5 py-3 text-slate-600">{t.unite || "-"}</td>
                  <td className="px-5 py-3 text-right text-slate-700">
                    {formaterFcfa(t.prix, 4)}
                    {t.prix !== null && t.precision ? (
                      <span
                        className={`block text-xs ${
                          unitesCompatibles(t.unite, t.precision) ? "text-slate-500" : "font-semibold text-amber-700"
                        }`}
                      >
                        par {t.precision}
                        {unitesCompatibles(t.unite, t.precision) ? "" : ` (quantite en ${t.unite} : verifie le prix)`}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">{formaterFcfa(t.cout)}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {t.auto ? `mouvements MP (${t.nombre})` : t.nombre}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
                <td className="px-5 py-3" colSpan={6}>
                  Cout total des consommables
                  {sansPrix > 0 ? (
                    <span className="ml-2 text-xs font-medium text-amber-700">
                      ({sansPrix} element(s) sans prix, non comptes)
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-right">{formaterFcfa(coutTotal)}</td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
