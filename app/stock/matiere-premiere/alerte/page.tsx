import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type AlerteRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  stock_actuel: number | null;
  seuil_alerte: number | null;
  conso_3_mois: number | null;
  conso_12_mois: number | null;
  cmd_bc: number | null;
  cmd_import: number | null;
  date_logistique: string | null;
  observation: string | null;
};

async function fetchAllAlertes() {
  const rows: AlerteRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("stock_alertes_matiere_premiere")
      .select(
        "id, nom_article, categorie, stock_actuel, seuil_alerte, conso_3_mois, conso_12_mois, cmd_bc, cmd_import, date_logistique, observation"
      )
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as AlerteRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default async function StockAlerteMpPage() {
  noStore();
  const { rows: alertes, error } = await fetchAllAlertes();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock Alert MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Articles matiere premiere sous le seuil d&apos;alerte (feuille Excel Alerte).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : alertes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune alerte pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold">Seuil alerte</th>
                    <th className="px-6 py-4 font-semibold">Conso 3 mois</th>
                    <th className="px-6 py-4 font-semibold">Conso 12 mois</th>
                    <th className="px-6 py-4 font-semibold">Cmd BC</th>
                    <th className="px-6 py-4 font-semibold">Cmd import</th>
                    <th className="px-6 py-4 font-semibold">Date logistique</th>
                    <th className="px-6 py-4 font-semibold">Observation</th>
                  </tr>
                </thead>
                <tbody>
                  {alertes.map((alerte) => (
                    <tr key={alerte.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{alerte.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{alerte.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.seuil_alerte)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.conso_3_mois)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.conso_12_mois)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.cmd_bc)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.cmd_import)}</td>
                      <td className="px-6 py-4 text-slate-600">{alerte.date_logistique || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{alerte.observation || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
