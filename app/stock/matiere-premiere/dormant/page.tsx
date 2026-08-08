import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  date_jour: string | null;
};

type Couleur = "JAUNE" | "ORANGE" | "ROUGE";

type DormantRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  stock_actuel: number;
  derniere_sortie: string | null;
  age_mois: number;
  couleur: Couleur;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllMouvements() {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_entree, qte_sortie, date_jour")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as MouvementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function monthsBetween(fromDate: Date, toDate: Date) {
  return (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth());
}

function getCouleur(ageMois: number): Couleur | null {
  if (ageMois >= 12) return "ROUGE";
  if (ageMois >= 6) return "ORANGE";
  if (ageMois >= 3) return "JAUNE";
  return null;
}

function priorityRank(couleur: Couleur) {
  if (couleur === "ROUGE") return 3;
  if (couleur === "ORANGE") return 2;
  return 1;
}

function colorBadgeClasses(couleur: Couleur) {
  switch (couleur) {
    case "ROUGE":
      return "bg-red-100 text-red-900";
    case "ORANGE":
      return "bg-orange-100 text-orange-900";
    case "JAUNE":
      return "bg-amber-100 text-amber-900";
  }
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ article?: string; categorie?: string; couleur?: string }>;

export default async function StockDormantMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const couleurFilter = (params.couleur || "").trim().toUpperCase();
  const hasFilters = Boolean(articleFilter || categorieFilter || couleurFilter);

  const [{ rows: articles, error: articlesError }, { rows: mouvements, error: mouvementsError }] =
    await Promise.all([fetchAllArticlesMp(), fetchAllMouvements()]);

  const error = articlesError || mouvementsError;

  // Stock actuel = somme entree-sortie (meme calcul que Stock Actuel MP).
  // "Derniere sortie" = date la plus recente parmi les mouvements de
  // sortie (qte_sortie > 0) de l'article - si l'article n'a JAMAIS eu de
  // sortie, on prend sa premiere entree a la place : dormant se mesure
  // depuis quand le stock est arrive sans jamais repartir.
  const stockByArticle = new Map<number, number>();
  const derniereSortieByArticle = new Map<number, string>();
  const premiereEntreeByArticle = new Map<number, string>();

  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    if (!row.date_jour) continue;

    if (Number(row.qte_sortie ?? 0) > 0) {
      const current = derniereSortieByArticle.get(row.article_id);
      if (!current || row.date_jour > current) {
        derniereSortieByArticle.set(row.article_id, row.date_jour);
      }
    }

    if (Number(row.qte_entree ?? 0) > 0) {
      const current = premiereEntreeByArticle.get(row.article_id);
      if (!current || row.date_jour < current) {
        premiereEntreeByArticle.set(row.article_id, row.date_jour);
      }
    }
  }

  const today = new Date();
  const dormantRows: DormantRow[] = [];

  for (const article of articles) {
    const stockActuel = stockByArticle.get(article.id) ?? 0;
    if (stockActuel <= 0) continue;

    const derniereSortie = derniereSortieByArticle.get(article.id) ?? null;
    const reference = derniereSortie ?? premiereEntreeByArticle.get(article.id) ?? null;
    if (!reference) continue;

    const ageMois = monthsBetween(new Date(reference), today);
    const couleur = getCouleur(ageMois);
    if (!couleur) continue;

    dormantRows.push({
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      stock_actuel: stockActuel,
      derniere_sortie: derniereSortie,
      age_mois: ageMois,
      couleur,
    });
  }

  const filteredRows = dormantRows
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .filter((row) => !couleurFilter || row.couleur === couleurFilter)
    .sort((a, b) => {
      if (priorityRank(b.couleur) !== priorityRank(a.couleur)) {
        return priorityRank(b.couleur) - priorityRank(a.couleur);
      }
      return b.age_mois - a.age_mois;
    });

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))];
  const categorieOptions = [...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock Dormant MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Articles avec du stock mais sans sortie depuis au moins 3 mois (jaune), 6 mois
              (orange) ou 12 mois (rouge).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-5 flex flex-wrap gap-2">
            {(["JAUNE", "ORANGE", "ROUGE"] as Couleur[]).map((item) => (
              <Link
                key={item}
                href={`/stock/matiere-premiere/dormant?${new URLSearchParams({
                  ...(articleFilter ? { article: articleFilter } : {}),
                  ...(categorieFilter ? { categorie: categorieFilter } : {}),
                  couleur: couleurFilter === item ? "" : item,
                }).toString()}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition hover:opacity-90 ${
                  couleurFilter === item ? "ring-2 ring-slate-900" : ""
                } ${colorBadgeClasses(item)}`}
              >
                {item}
              </Link>
            ))}
          </div>

          <form className="grid gap-3 sm:grid-cols-4">
            <input
              type="text"
              name="article"
              list="dormant-mp-articles"
              autoComplete="off"
              defaultValue={articleFilter}
              placeholder="Article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="dormant-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="categorie"
              list="dormant-mp-categories"
              autoComplete="off"
              defaultValue={params.categorie || ""}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="dormant-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input type="hidden" name="couleur" value={couleurFilter} />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/dormant"
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
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun stock dormant detecte pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                    <th className="px-6 py-4 font-semibold">Derniere sortie</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${colorBadgeClasses(
                            row.couleur
                          )}`}
                        >
                          {row.couleur}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-900">{formatNumber(row.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.derniere_sortie ? formatDate(row.derniere_sortie) : "Jamais"}
                      </td>
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
