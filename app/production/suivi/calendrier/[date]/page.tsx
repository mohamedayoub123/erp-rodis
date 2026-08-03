import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { buildPdLabelByCode, fetchAllProgrammeLignes, formatQty, pdLabelsForNumeroLot } from "../../data";

function formatDateLong(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default async function CalendrierJourPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  noStore();
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }

  const [{ rows: lignes }, pdLabelByCode] = await Promise.all([
    fetchAllProgrammeLignes({ activeOnly: true }),
    buildPdLabelByCode(),
  ]);
  const dayLignes = lignes.filter(
    (ligne) => !ligne.programme_termine && String(ligne.date_jour).slice(0, 10) === date
  );
  const pdCount = new Set(
    dayLignes
      .map((ligne) => pdLabelsForNumeroLot(ligne.numero_lot, pdLabelByCode))
      .filter((label) => label !== "-")
  ).size;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Programme du {formatDateLong(date)}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {dayLignes.length} ligne{dayLignes.length > 1 ? "s" : ""} programmee
                {dayLignes.length > 1 ? "s" : ""} ce jour-la - {pdCount} PD.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/calendrier" label="Retour calendrier" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {dayLignes.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Rien de programme pour cette date.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Zone</th>
                    <th className="px-4 py-3 font-semibold">Chaine</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">N Lot</th>
                    <th className="px-4 py-3 font-semibold">PD</th>
                    <th className="px-4 py-3 font-semibold">Plateforme</th>
                    <th className="px-4 py-3 font-semibold">Vrac prevu</th>
                    <th className="px-4 py-3 font-semibold">Carton prevu</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLignes.map((ligne) => (
                    <tr key={ligne.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{ligne.zone}</td>
                      <td className="px-4 py-3 text-slate-700">{ligne.chaine}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.produit || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.numero_lot || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {pdLabelsForNumeroLot(ligne.numero_lot, pdLabelByCode)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{ligne.plateforme || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {ligne.vrac_a_fabriquer !== null ? formatQty(ligne.vrac_a_fabriquer) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {ligne.qt_carton !== null ? formatQty(ligne.qt_carton) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {ligne.programme_termine ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            Termine
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            En cours
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
