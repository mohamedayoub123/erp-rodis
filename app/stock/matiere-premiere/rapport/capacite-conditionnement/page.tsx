import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";
import {
  computeCartonsPossiblesTotal,
  computeLignesCapacite,
  fetchStockActuelMp,
  findLigneLimitante,
  type LigneCapacite,
  type RecetteLigneRow,
} from "./capacite-lib";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  quantite_recette_base: number | null;
};

type LigneCountRow = {
  article_pf_id: number;
};

async function fetchArticlesFini() {
  const rows: ArticlePfRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, quantite_recette_base")
      .neq("nature", "vrac")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticlePfRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchLigneCounts() {
  const rows: LigneCountRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("recettes_pf")
      .select("article_pf_id")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as LigneCountRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchRecetteLignesPour(articlePfIds: number[]) {
  if (articlePfIds.length === 0) return { rows: [] as RecetteLigneRow[], error: null };

  const rows: RecetteLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("recettes_pf")
      .select("id, article_pf_id, article_mp_id, quantite")
      .in("article_pf_id", articlePfIds)
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as RecetteLigneRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{ q?: string; ids?: string | string[] }>;

function parseSelectedIds(raw: string | string[] | undefined): number[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const ids = values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(ids)];
}

// Choisis un ou plusieurs produits finis (article PF) et cette page dit
// combien de cartons de CHAQUE produit le stock actuel des articles de sa
// recette Conditionnement (flacon, capsule, etiquette...) permet de
// fabriquer - la recette Fabrication (vrac) n'entre pas dans ce calcul,
// seule la recette Conditionnement (voir /production/recette-conditionnement/[id])
// compte. Coche plusieurs lignes puis "Comparer" pour un tableau cote a
// cote (une ligne par produit).
export default async function CapaciteConditionnementListPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const qLower = q.toLowerCase();
  const selectedIds = parseSelectedIds(params.ids);

  const [{ rows: articles, error: articlesError }, { rows: lignes, error: lignesError }] = await Promise.all([
    fetchArticlesFini(),
    fetchLigneCounts(),
  ]);

  const error = articlesError || lignesError;

  const countByArticle = new Map<number, number>();
  for (const ligne of lignes) {
    countByArticle.set(ligne.article_pf_id, (countByArticle.get(ligne.article_pf_id) ?? 0) + 1);
  }

  // Seuls les produits qui ont deja une recette Conditionnement peuvent
  // avoir une capacite calculee - meme filtre que la liste des recettes
  // elle-meme (/production/recette-conditionnement).
  const filteredArticles = articles
    .filter((article) => (countByArticle.get(article.id) ?? 0) > 0)
    .filter((article) => !qLower || matchesArticleSearch(article.nom_article, qLower))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const qOptions = [...new Set(articles.map((article) => article.nom_article))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const articleById = new Map(articles.map((article) => [article.id, article]));
  const comparaisonIds = selectedIds.filter((id) => articleById.has(id));

  let comparaisonRows: {
    article: ArticlePfRow;
    lignesCapacite: LigneCapacite[];
    lignesParArticleMpId: Map<number, LigneCapacite>;
    cartonsPossibles: number | null;
    ligneLimitanteId: number | null;
    manqueLot: boolean;
    aucuneRecette: boolean;
  }[] = [];
  let comparaisonError: { message: string } | null = null;
  // Union de tous les articles de conditionnement utilises par AU MOINS UN
  // des produits selectionnes - une colonne par article (ex: "SLEEVE"), pour
  // comparer directement la quantite necessaire de chacun produit par
  // produit, meme quand un article est partage par plusieurs recettes.
  let articleColumns: { articleMpId: number; nomArticle: string; unite: string | null }[] = [];

  if (comparaisonIds.length > 0) {
    const [{ rows: lignesRecette, error: lignesRecetteError }, stockActuelRows] = await Promise.all([
      fetchRecetteLignesPour(comparaisonIds),
      fetchStockActuelMp(),
    ]);

    comparaisonError = lignesRecetteError;
    const stockById = new Map(stockActuelRows.map((row) => [row.article_id, row]));
    const lignesParArticle = new Map<number, RecetteLigneRow[]>();
    for (const ligne of lignesRecette) {
      const list = lignesParArticle.get(ligne.article_pf_id) ?? [];
      list.push(ligne);
      lignesParArticle.set(ligne.article_pf_id, list);
    }

    comparaisonRows = comparaisonIds.map((id) => {
      const article = articleById.get(id)!;
      const lignesArticle = lignesParArticle.get(id) ?? [];
      const lignesCapacite = computeLignesCapacite(lignesArticle, article.quantite_recette_base, stockById);
      const cartonsPossiblesTotal = computeCartonsPossiblesTotal(lignesCapacite);
      const ligneLimitante = findLigneLimitante(lignesCapacite, cartonsPossiblesTotal);

      return {
        article,
        lignesCapacite,
        lignesParArticleMpId: new Map(lignesCapacite.map((ligne) => [ligne.articleMpId, ligne])),
        cartonsPossibles: cartonsPossiblesTotal,
        ligneLimitanteId: ligneLimitante?.ligneId ?? null,
        manqueLot: lignesArticle.length > 0 && !article.quantite_recette_base,
        aucuneRecette: lignesArticle.length === 0,
      };
    });

    const columnsById = new Map<number, { articleMpId: number; nomArticle: string; unite: string | null }>();
    for (const row of comparaisonRows) {
      for (const ligne of row.lignesCapacite) {
        if (!columnsById.has(ligne.articleMpId)) {
          columnsById.set(ligne.articleMpId, {
            articleMpId: ligne.articleMpId,
            nomArticle: ligne.nomArticle,
            unite: ligne.unite,
          });
        }
      }
    }
    articleColumns = [...columnsById.values()].sort((a, b) =>
      a.nomArticle.localeCompare(b.nomArticle, "fr", { sensitivity: "base" })
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Capacite Conditionnement
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis un ou plusieurs produits finis : combien de cartons le stock actuel des
                articles de leur recette Conditionnement (flacon, capsule, etiquette...) permet de
                fabriquer.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/rapport" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {comparaisonIds.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                Comparaison ({comparaisonIds.length} produit{comparaisonIds.length > 1 ? "s" : ""})
              </h2>
              <Link
                href="/stock/matiere-premiere/rapport/capacite-conditionnement"
                className="text-xs font-semibold text-slate-500 underline"
              >
                Effacer la selection
              </Link>
            </div>
            {comparaisonError ? (
              <div className="px-6 py-8">
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {comparaisonError.message}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Produit fini</th>
                      <th className="px-6 py-4 font-semibold">Gamme</th>
                      <th className="px-6 py-4 font-semibold">Cartons possibles</th>
                      {articleColumns.map((col) => (
                        <th key={col.articleMpId} className="px-6 py-4 font-semibold">
                          {col.nomArticle}
                        </th>
                      ))}
                      <th className="px-6 py-4 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparaisonRows.map((row) => (
                      <tr key={row.article.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.article.nom_article}
                          {row.aucuneRecette ? (
                            <p className="mt-1 text-xs font-normal text-red-600">
                              Aucune recette Conditionnement
                            </p>
                          ) : row.manqueLot ? (
                            <p className="mt-1 text-xs font-normal text-amber-600">
                              Nombre de cartons du lot non renseigne
                            </p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{row.article.gamme || "-"}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.aucuneRecette
                            ? "-"
                            : row.manqueLot
                              ? "-"
                              : row.cartonsPossibles !== null
                                ? row.cartonsPossibles.toLocaleString("fr-FR")
                                : "-"}
                        </td>
                        {articleColumns.map((col) => {
                          const ligne = row.lignesParArticleMpId.get(col.articleMpId);
                          const estLimitante = ligne !== undefined && ligne.ligneId === row.ligneLimitanteId;
                          return (
                            <td
                              key={col.articleMpId}
                              className={`px-6 py-4 ${estLimitante ? "bg-amber-50" : ""}`}
                            >
                              {ligne && ligne.quantiteParCarton !== null ? (
                                <>
                                  <div
                                    className={`font-semibold ${estLimitante ? "text-amber-700" : "text-slate-900"}`}
                                  >
                                    {ligne.quantiteParCarton.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}{" "}
                                    <span className="font-normal text-slate-400">{ligne.unite || ""}</span>
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {ligne.cartonsPossibles !== null
                                      ? `${ligne.cartonsPossibles.toLocaleString("fr-FR")} cartons possibles`
                                      : "-"}
                                  </div>
                                </>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4">
                          <Link
                            href={`/stock/matiere-premiere/rapport/capacite-conditionnement/${row.article.id}`}
                            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                          >
                            Voir le detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="flex gap-3">
            {/* Filtrer par texte ne doit pas effacer la selection en cours -
            sinon chercher un autre produit perdrait silencieusement les
            cases deja cochees. */}
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <div className="flex-1">
              <SearchableFilterInput
                name="q"
                defaultValue={q}
                options={qOptions}
                placeholder="Rechercher un produit fini..."
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {q ? (
              <Link
                href="/stock/matiere-premiere/rapport/capacite-conditionnement"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <form action="/stock/matiere-premiere/rapport/capacite-conditionnement" method="get">
          {/* Garde la selection en vie meme pour un produit que le filtre
          "q" masque actuellement - sinon changer le texte de recherche
          effacerait silencieusement la selection des produits qui ne sont
          plus visibles a l'ecran. */}
          {selectedIds
            .filter((id) => !filteredArticles.some((article) => article.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {error ? (
              <div className="px-6 py-8">
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error.message}
                </p>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-500">
                {q
                  ? "Aucun resultat pour ce filtre."
                  : "Aucun produit fini avec une recette Conditionnement pour le moment."}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <p className="text-sm text-slate-500">
                    Coche plusieurs produits puis clique &quot;Comparer&quot; pour un tableau cote a
                    cote.
                  </p>
                  <button
                    type="submit"
                    className="rounded-full bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
                  >
                    Comparer la selection
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold"></th>
                        <th className="px-6 py-4 font-semibold">Produit fini</th>
                        <th className="px-6 py-4 font-semibold">Gamme</th>
                        <th className="px-6 py-4 font-semibold">Articles dans la recette</th>
                        <th className="px-6 py-4 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArticles.map((article) => (
                        <tr key={article.id} className="border-t border-slate-100">
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              name="ids"
                              value={article.id}
                              defaultChecked={selectedIds.includes(article.id)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                          <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                          <td className="px-6 py-4 text-slate-600">{countByArticle.get(article.id) ?? 0}</td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/stock/matiere-premiere/rapport/capacite-conditionnement/${article.id}`}
                              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Voir la capacite
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </form>
      </div>
    </main>
  );
}
