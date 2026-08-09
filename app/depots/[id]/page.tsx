import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type DepotRow = { id: number; nom: string };
type ArticlePfRow = { id: number; nom_article: string; nature: string | null };
type ArticleMpRow = { id: number; nom_article: string; unite: string | null };
type MouvementRow = { article_id: number | null; qte_entree: number; qte_sortie: number };

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
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

// Solde reel par article (entree - sortie) a partir des mouvements de stock
// deja existants (lots_stock pour le PF, lots_stock_matiere_premiere pour
// la MP) - le depot n'ajoute rien lui-meme, il classe juste quel article va
// dans quel depot (voir articles.depot_id / articles_matiere_premiere.depot_id).
function computeSoldeByArticleId(mouvements: MouvementRow[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const mv of mouvements) {
    if (!mv.article_id) continue;
    map.set(mv.article_id, (map.get(mv.article_id) ?? 0) + Number(mv.qte_entree ?? 0) - Number(mv.qte_sortie ?? 0));
  }
  return map;
}

export default async function DepotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const depotId = Number(id);
  if (!depotId) {
    notFound();
  }

  const [
    { data: depotData },
    { rows: articlesPf },
    { rows: articlesMp },
    { rows: mouvementsPf },
    { rows: mouvementsMp },
  ] = await Promise.all([
    supabaseServer.from("depots").select("id, nom").eq("id", depotId).maybeSingle(),
    fetchAll<ArticlePfRow>("articles", "id, nom_article, nature, depot_id").then((res) => ({
      ...res,
      rows: (res.rows as (ArticlePfRow & { depot_id: number | null })[]).filter((a) => a.depot_id === depotId),
    })),
    fetchAll<ArticleMpRow>("articles_matiere_premiere", "id, nom_article, unite, depot_id").then((res) => ({
      ...res,
      rows: (res.rows as (ArticleMpRow & { depot_id: number | null })[]).filter((a) => a.depot_id === depotId),
    })),
    fetchAll<MouvementRow>("lots_stock", "article_id, qte_entree, qte_sortie"),
    fetchAll<MouvementRow>("lots_stock_matiere_premiere", "article_id, qte_entree, qte_sortie"),
  ]);

  const depot = depotData as DepotRow | null;
  if (!depot) {
    notFound();
  }

  const soldePfById = computeSoldeByArticleId(mouvementsPf);
  const soldeMpById = computeSoldeByArticleId(mouvementsMp);

  const stockPf = articlesPf
    .map((a) => ({ id: a.id, nom: a.nom_article, nature: a.nature, solde: soldePfById.get(a.id) ?? 0 }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  const stockMp = articlesMp
    .map((a) => ({ id: a.id, nom: a.nom_article, unite: a.unite, solde: soldeMpById.get(a.id) ?? 0 }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Depot
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{depot.nom}</h1>
              <p className="mt-2 text-sm text-slate-600">
                Stock reel des articles rattaches a ce depot - pour changer le depot d&apos;un
                article, modifie-le depuis{" "}
                <Link href="/articles/produit-fini" className="text-sky-700 underline">
                  Articles Produit Fini
                </Link>{" "}
                ou{" "}
                <Link href="/articles/matiere-premiere" className="text-sky-700 underline">
                  Articles Matiere Premiere
                </Link>
                .
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Produit fini
          </h2>
          {stockPf.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun article produit fini dans ce depot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Nature</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPf.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{row.nature === "vrac" ? "Vrac" : "Fini"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Matiere premiere
          </h2>
          {stockMp.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun article matiere premiere dans ce depot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {stockMp.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.solde)}</td>
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
