import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { MultiSelectFilter } from "@/app/_components/multi-select-filter";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";
import { construireQuery, correspondALaListe, lireListeParam, optionsDistinctes } from "@/lib/filtre-multiple";
import { matchesArticleSearch } from "@/lib/article-search";
import { fetchAgregatsMpParArticle, isoMoisAvant } from "@/lib/mp-agregats";
import { formatDate } from "@/lib/format-date";

// Rapport MP "Sorties 6 mois" : TOUS les articles de matiere premiere avec leur sortie des 6 derniers mois (somme des mouvements de
// sortie dont la date est dans les 6 derniers mois, tous depots - meme definition que Stock Dormant, Besoin Commande et Stock Alert MP).
// Filtres : famille (= categorie de l'article), sous famille, article.
const CHEMIN = "/stock/matiere-premiere/rapport/sorties-6-mois";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
};

type SortieRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
  sortie_6_mois: number;
  moyenne_par_mois: number;
  derniere_sortie: string | null;
};

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

// Plus de 1500 articles : le tableau montre les plus grosses sorties, "Voir tout" affiche le reste (le filtre et l'export Excel portent
// toujours sur tout).
const LIMITE_LIGNES = 150;

export default async function SortiesSixMoisMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categoriesChoisies = lireListeParam(params.categorie);
  const sousFamillesChoisies = lireListeParam(params.sous_famille);
  const hasFilters = Boolean(articleFilter || categoriesChoisies.length || sousFamillesChoisies.length);

  const [{ rows: articles, error: articlesError }, { rows: agregats, error: mouvementsError }] = await Promise.all([
    fetchAllArticlesMp(),
    fetchAgregatsMpParArticle(),
  ]);
  const error = articlesError || mouvementsError;

  const agregatParArticle = new Map(agregats.map((row) => [row.article_id, row]));

  const toutesLesLignes: SortieRow[] = articles.map((article) => {
    const agregat = agregatParArticle.get(article.id);
    const sortie = Number(agregat?.sortie_6_mois ?? 0);
    return {
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      sous_famille: article.sous_famille,
      unite: article.unite,
      sortie_6_mois: Math.round(sortie * 100) / 100,
      moyenne_par_mois: Math.round((sortie / 6) * 100) / 100,
      // derniere sortie de l'article, meme plus ancienne que 6 mois : permet de voir quand il a bouge pour la derniere fois
      derniere_sortie: agregat?.derniere_sortie ?? null,
    };
  });

  const lignes = toutesLesLignes
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => correspondALaListe(row.categorie, categoriesChoisies))
    .filter((row) => correspondALaListe(row.sous_famille, sousFamillesChoisies))
    .sort((a, b) => b.sortie_6_mois - a.sortie_6_mois || a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const avecSortie = lignes.filter((row) => row.sortie_6_mois > 0).length;
  const toutAffiche = params.tout === "1";
  const lignesAffichees = toutAffiche ? lignes : lignes.slice(0, LIMITE_LIGNES);
  const hrefVoirTout = `${CHEMIN}?${construireQuery(
    { article: articleFilter, tout: "1" },
    { categorie: categoriesChoisies, sous_famille: sousFamillesChoisies }
  )}`;

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map((label, id) => ({ id, label }));
  const categorieOptions = optionsDistinctes(articles.map((article) => article.categorie));
  const sousFamilleOptions = optionsDistinctes(articles.map((article) => article.sous_famille));

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const debut = isoMoisAvant(6);

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Famille (categorie)", key: "categorie" },
    { label: "Sous famille", key: "sousFamille" },
    { label: "Unite", key: "unite" },
    { label: "Sortie 6 derniers mois", key: "sortie" },
    { label: "Moyenne par mois", key: "moyenne" },
    { label: "Derniere sortie", key: "derniereSortie" },
  ];

  const exportRows = lignes.map((row) => ({
    article: row.nom_article,
    categorie: row.categorie || "-",
    sousFamille: row.sous_famille || "-",
    unite: row.unite || "-",
    sortie: row.sortie_6_mois,
    moyenne: row.moyenne_par_mois,
    derniereSortie: formatDate(row.derniere_sortie),
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">ERP Rodis</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Sorties 6 mois MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles de matiere premiere avec leur sortie des 6 derniers mois (du {formatDate(debut)} au{" "}
              {formatDate(aujourdhui)}, tous depots). Trie de la plus grosse sortie a la plus petite ; les articles sans sortie sont
              en bas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton rows={exportRows} columns={exportColumns} filename={`sorties-6-mois-mp-${aujourdhui}.xlsx`} />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <SearchableFilterInput name="article" defaultValue={articleFilter} options={articleOptions} placeholder="Article..." />
            <MultiSelectFilter
              name="categorie"
              placeholder="Famille (categorie)..."
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
                  href={CHEMIN}
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
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : lignes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article de matiere premiere."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <p className="border-b border-slate-100 px-6 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{lignes.length}</span> article(s), dont{" "}
                <span className="font-semibold text-slate-900">{avecSortie}</span> avec une sortie sur les 6 derniers mois.
              </p>
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Famille (categorie)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Sous famille</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-6 py-4 font-semibold text-sky-800">Sortie 6 derniers mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Moyenne par mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Derniere sortie</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesAffichees.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.sous_famille || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td
                        className={`bg-sky-50/30 px-6 py-4 font-semibold ${
                          row.sortie_6_mois > 0 ? "text-sky-800" : "text-slate-400"
                        }`}
                      >
                        {formatNumber(row.sortie_6_mois)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.moyenne_par_mois)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.derniere_sortie)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <VoirToutBanner affiches={lignesAffichees.length} total={lignes.length} href={hrefVoirTout} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
