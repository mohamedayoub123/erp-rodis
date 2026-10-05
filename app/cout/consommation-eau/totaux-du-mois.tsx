import { formaterQuantite, type TotalElement } from "@/lib/cout-eau-conso";
import { libelleMois } from "@/lib/cout-eau";

// Total du mois : somme des saisies datees, element par element.
export function TotauxDuMois({ annee, mois, totaux }: { annee: number; mois: number; totaux: TotalElement[] }) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Consommation de {libelleMois(annee, mois)}</h2>
        <p className="mt-1 text-sm text-slate-600">Total des saisies datees du mois, element par element.</p>
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
                <th className="px-5 py-3 font-semibold">Saisies</th>
              </tr>
            </thead>
            <tbody>
              {totaux.map((t) => (
                <tr key={t.cle} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-slate-900">{t.libelle}</td>
                  <td className="px-5 py-3 text-slate-700">{formaterQuantite(t.ligne1)}</td>
                  <td className="px-5 py-3 text-slate-700">{formaterQuantite(t.ligne2)}</td>
                  <td className="px-5 py-3 font-semibold text-sky-800">{formaterQuantite(t.total)}</td>
                  <td className="px-5 py-3 text-slate-600">{t.unite || "-"}</td>
                  <td className="px-5 py-3 text-slate-600">{t.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
