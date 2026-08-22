import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ArticlesProduitFiniTable, type ArticleRow } from "./articles-table";
import { familyRank, articleTypeRank, articleContenanceFromName } from "@/lib/gamme-families";

const ARTICLE_SELECT_FIELDS =
  "id, nom_article, type_article, marque, gamme, nature, min_stock, max_stock, volume_unitaire, volume_stockage, cadence, nb_carton_par_vrac, max_production_vrac_8h, contenance, nb_piece_par_max_vrac, piece_par_carton, min_vrac, max_vrac_auto, vrac_max_manuel, dispenseur_pcs_carton, besoin_pot_flacon, besoin_capsule, besoin_sleeve, besoin_dispenseur, besoin_carton, besoin_etiquette, besoin_etui, code_auto, code_manu, depot_id";

async function fetchAllArticles() {
  const rows: ArticleRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select(ARTICLE_SELECT_FIELDS)
      .range(from, from + pageSize - 1);

    if (error) {
      return { rows, error };
    }

    const chunk = (data ?? []) as unknown as ArticleRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function ArticlesProduitFiniPage() {
  noStore();
  const currentStockUser = await getCurrentStockUser();
  const canWriteArticles = await canWritePageUser(currentStockUser, "articlesProduitFiniNouvelle");
  const canEditArticles = await canWritePageUser(currentStockUser, "articlesProduitFini");
  const canDeleteArticles = await canDeletePageUser(currentStockUser, "articlesProduitFini");

  const [{ rows: allArticles, error: fetchError }, depotsResult] = await Promise.all([
    fetchAllArticles(),
    supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true }),
  ]);
  const depots = ((depotsResult.data ?? []) as { id: number; nom: string }[]).map((d) => ({
    id: d.id,
    label: d.nom,
  }));

  // Meme ordre que /tableau-commandes : familles (White Secret en premier),
  // puis a l'interieur d'une famille l'ordre par type d'article (Lait,
  // Creme, DSR, Huile, Serum, Savon, Gel douche, EDC, Pommade, Talc), puis
  // par contenance decroissante, puis alphabetique.
  const sortedArticles = [...allArticles].sort((a, b) => {
    const rankA = familyRank(a.gamme);
    const rankB = familyRank(b.gamme);
    if (rankA !== rankB) return rankA - rankB;

    const typeRankA = articleTypeRank(a.nom_article);
    const typeRankB = articleTypeRank(b.nom_article);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const contenanceDiff =
      articleContenanceFromName(b.nom_article) - articleContenanceFromName(a.nom_article);
    if (contenanceDiff !== 0) return contenanceDiff;

    return String(a.nom_article ?? "").localeCompare(String(b.nom_article ?? ""), "fr", {
      sensitivity: "base",
    });
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Articles Produit Fini
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Cette page remplace la feuille Data. Tu vois ici tout ce qui est dans Data
              et tu peux ajouter un article directement.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/gestion-stock-pf" label="Retour gestion stock PF" />
            <RefreshButton />
            <Link
              href="/stock"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Voir Stock
            </Link>
            {canWriteArticles ? (
              <Link
                href="/articles/produit-fini/nouvelle"
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
              >
                Ajouter article
              </Link>
            ) : null}
          </div>
        </div>

        {fetchError ? (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {fetchError.message}
            </p>
          </section>
        ) : (
          <ArticlesProduitFiniTable
            articles={sortedArticles}
            depots={depots}
            canEditArticles={canEditArticles}
            canDeleteArticles={canDeleteArticles}
          />
        )}
      </div>
    </main>
  );
}
