import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

type DestructionRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  article_vrac_id: number | null;
  quantite: number;
  utilisateur: string | null;
  date_destruction: string;
};

type LigneRow = { id: number; produit: string | null; zone: string | null; chaine: string | null };
type ArticleRow = { id: number; nom_article: string };

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(select)
      .order("date_destruction", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Trace les codes dont la fabrication a ete jugee "A detruire" au Test
// labo (voir enregistrerDestructionVrac, app/production/suivi-production/
// actions.ts) - la quantite indiquee ici n'est JAMAIS entree dans le
// stock reel Depot B, contrairement a "A recuperer" qui credite quand
// meme (visible dans les mouvements de stock avec sa note distincte).
export default async function HistoriqueDestructionPage() {
  noStore();

  const { rows: destructions } = await fetchAll<DestructionRow>(
    "production_destruction_history",
    "id, programme_ligne_id, code, article_vrac_id, quantite, utilisateur, date_destruction"
  );

  const ligneIds = [...new Set(destructions.map((d) => d.programme_ligne_id))];
  const articleIds = [...new Set(destructions.map((d) => d.article_vrac_id).filter((id): id is number => Boolean(id)))];

  const [{ data: lignesData }, { data: articlesData }] = await Promise.all([
    ligneIds.length > 0
      ? supabaseServer.from("programme_lignes").select("id, produit, zone, chaine").in("id", ligneIds)
      : Promise.resolve({ data: [] as LigneRow[] }),
    articleIds.length > 0
      ? supabaseServer.from("articles").select("id, nom_article").in("id", articleIds)
      : Promise.resolve({ data: [] as ArticleRow[] }),
  ]);

  const ligneById = new Map(((lignesData ?? []) as LigneRow[]).map((l) => [l.id, l]));
  const articleById = new Map(((articlesData ?? []) as ArticleRow[]).map((a) => [a.id, a]));

  const rows = destructions.map((d) => {
    const ligne = ligneById.get(d.programme_ligne_id);
    const article = d.article_vrac_id ? articleById.get(d.article_vrac_id) : null;
    return {
      id: d.id,
      code: d.code,
      produit: article?.nom_article ?? ligne?.produit ?? "-",
      zoneChaine: ligne ? [ligne.zone, ligne.chaine].filter(Boolean).join(" / ") : "-",
      quantite: d.quantite,
      utilisateur: d.utilisateur || "-",
      date: d.date_destruction,
    };
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Production
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique destruction
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Codes dont le vrac a ete detruit (Test labo &quot;A detruire&quot;) - jamais entre dans le
                stock reel.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucun code detruit pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Produit</th>
                    <th className="px-6 py-4 font-semibold">Zone / Chaine</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                    <th className="px-6 py-4 font-semibold">Saisi par</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.code}</td>
                      <td className="px-6 py-4 text-slate-600">{row.produit}</td>
                      <td className="px-6 py-4 text-slate-600">{row.zoneChaine}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.quantite)}</td>
                      <td className="px-6 py-4 text-slate-600">{row.utilisateur}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.date)}</td>
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
