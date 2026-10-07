import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { MultiSelectFilter } from "@/app/_components/multi-select-filter";
import { construireQuery, correspondALaListe, lireListeParam, optionsDistinctes } from "@/lib/filtre-multiple";
import { matchesArticleSearch } from "@/lib/article-search";
import { fetchAgregatsMpParArticle } from "@/lib/mp-agregats";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
};

type SurstockRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
  stock_actuel: number;
  objectif_6_mois: number;
  surplus: number;
};

// Meme calcul que Besoin Commande MP / Proposition de Commande MP :
// objectif pour un mois de depart = somme de la consommation reelle de ce
// mois-la et des 8 suivants (3 mois de delai de livraison + 6 mois de
// cycle de commande, sur les 12 derniers mois, un seul passage par mois
// calendaire - la consommation varie selon le mois, ce n'est pas une
// moyenne fixe).
const DELAI_LIVRAISON_MOIS = 3;
const CYCLE_COMMANDE_MOIS = 6;

function objectifGlissant(consommationParMoisCalendaire: number[], moisDepart: number) {
  let total = 0;
  for (let decalage = 0; decalage < DELAI_LIVRAISON_MOIS + CYCLE_COMMANDE_MOIS; decalage++) {
    total += consommationParMoisCalendaire[(moisDepart + decalage) % 12];
  }
  return Math.round(total * 100) / 100;
}

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, sous_famille, unite")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// categorie / sous_famille : plusieurs valeurs possibles (?categorie=A&categorie=B) - voir MultiSelectFilter.
type SearchParams = Promise<{
  article?: string;
  categorie?: string | string[];
  sous_famille?: string | string[];
  tout?: string;
}>;

// Plus de 1500 articles rendaient ~2,7 Mo de HTML a chaque ouverture : le
// tableau montre les plus gros surplus de la liste triee, "Voir tout"
// affiche le reste (le filtre et l'export Excel portent toujours sur tout).
const LIMITE_LIGNES = 150;

export default async function SurstockMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categoriesChoisies = lireListeParam(params.categorie);
  const sousFamillesChoisies = lireListeParam(params.sous_famille);
  const hasFilters = Boolean(articleFilter || categoriesChoisies.length || sousFamillesChoisies.length);

  const moisIdx = new Date().getMonth();

  const [{ rows: articles, error: articlesError }, { rows: agregats, error: mouvementsError }] =
    await Promise.all([fetchAllArticlesMp(), fetchAgregatsMpParArticle()]);

  const error = articlesError || mouvementsError;

  // Stock actuel = somme entree-sortie de TOUS les mouvements (meme calcul
  // que Stock MP). Consommation par mois calendaire = sortie des 12
  // derniers mois seulement, regroupee par mois (Janvier, Fevrier...).
  // Objectif = besoin des 9 mois a partir du mois actuel (3 de delai de
  // livraison + 6 de cycle de commande, meme formule que Besoin Commande MP
  // / Proposition). Surstock = ce qui depasse cet objectif : stock qu'on
  // n'a pas besoin de toucher avant plus de 9 mois.
  // Stock et consommation par mois calendaire sont calcules directement par
  // la base (une ligne par article, voir lib/mp-agregats.ts) au lieu de
  // telecharger tous les mouvements.
  const stockByArticle = new Map<number, number>();
  const consommationByArticleAndMois = new Map<number, number[]>();

  for (const row of agregats) {
    stockByArticle.set(row.article_id, Number(row.stock ?? 0));
    consommationByArticleAndMois.set(
      row.article_id,
      Array.from({ length: 12 }, (_, idx) => Number(row.sortie_par_mois?.[idx] ?? 0))
    );
  }

  const surstockRows: SurstockRow[] = articles
    .map((article) => {
      const stockActuel = stockByArticle.get(article.id) ?? 0;
      const consommationParMoisCalendaire = consommationByArticleAndMois.get(article.id) ?? new Array(12).fill(0);
      const objectif = objectifGlissant(consommationParMoisCalendaire, moisIdx);

      return {
        article_id: article.id,
        nom_article: article.nom_article,
        categorie: article.categorie,
        sous_famille: article.sous_famille,
        unite: article.unite,
        stock_actuel: stockActuel,
        objectif_6_mois: objectif,
        surplus: Math.round((stockActuel - objectif) * 100) / 100,
      };
    })
    .filter((row) => row.stock_actuel > 0 && row.surplus > 0)
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => correspondALaListe(row.categorie, categoriesChoisies))
    .filter((row) => correspondALaListe(row.sous_famille, sousFamillesChoisies))
    .sort((a, b) => b.surplus - a.surplus);

  const toutAffiche = params.tout === "1";
  const surstockRowsAffichees = toutAffiche ? surstockRows : surstockRows.slice(0, LIMITE_LIGNES);
  const hrefVoirTout = `/stock/matiere-premiere/rapport/surstock?${construireQuery(
    { article: articleFilter, tout: "1" },
    { categorie: categoriesChoisies, sous_famille: sousFamillesChoisies }
  )}`;

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map((label, id) => ({
    id,
    label,
  }));
  const categorieOptions = optionsDistinctes(articles.map((article) => article.categorie));
  const sousFamilleOptions = optionsDistinctes(articles.map((article) => article.sous_famille));

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Categorie", key: "categorie" },
    { label: "Sous famille", key: "sousFamille" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stockActuel" },
    { label: "Stock necessaire (9 mois)", key: "stockNecessaire" },
    { label: "Surplus", key: "surplus" },
  ];

  const exportRows = surstockRows.map((row) => ({
    article: row.nom_article,
    categorie: row.categorie || "-",
    sousFamille: row.sous_famille || "-",
    unite: row.unite || "-",
    stockActuel: row.stock_actuel,
    stockNecessaire: row.objectif_6_mois,
    surplus: row.surplus,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Surstock MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Articles dont le stock actuel depasse ce qu&apos;il faut pour tenir 9 mois a partir
              d&apos;aujourd&apos;hui (3 mois de delai de livraison + 6 mois de cycle de commande,
              meme calcul que Besoin Commande MP / Proposition de Commande, base sur la
              consommation reelle de chaque mois). Le surplus = stock actuel moins cet objectif.
              Trie du plus gros surplus au plus petit.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`surstock-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <SearchableFilterInput
              name="article"
              defaultValue={articleFilter}
              options={articleOptions}
              placeholder="Article..."
            />
            <MultiSelectFilter
              name="categorie"
              placeholder="Categorie..."
              options={categorieOptions}
              selected={categoriesChoisies}
            />
            <MultiSelectFilter
              name="sous_famille"
              placeholder="Sous famille..."
              options={sousFamilleOptions}
              selected={sousFamillesChoisies}
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/rapport/surstock"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </a>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : surstockRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article en surstock pour le moment."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Sous famille</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock necessaire (9 mois)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Surplus</th>
                  </tr>
                </thead>
                <tbody>
                  {surstockRowsAffichees.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.sous_famille || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.objectif_6_mois)}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">
                          {formatNumber(row.surplus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <VoirToutBanner affiches={surstockRowsAffichees.length} total={surstockRows.length} href={hrefVoirTout} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
