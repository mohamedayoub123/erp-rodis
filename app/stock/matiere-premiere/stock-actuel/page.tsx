import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { matchesArticleSearch } from "@/lib/article-search";
import { encodeDossierId } from "../commande/dossier-id";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  numero_lot: string | null;
};

type BcLigneRow = {
  id: number;
  article_id: number | null;
  code: string;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  quantite: number | null;
};

type ImportEvenementRow = {
  bc_ligne_id: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  quantite_importee: number;
  lot_stock_id: number | null;
};

type BcRef = {
  code: string;
  nDoss4d: string | null;
  nDossErp: string | null;
  quantite: number;
};

type DossierRef = {
  nDoss4d: string | null;
  nDossErp: string | null;
  qteImportee: number;
};

type StockRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
  codes: string[];
  bcRefs: BcRef[];
  importRefs: DossierRef[];
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite")
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
      .select("article_id, qte_entree, qte_sortie, numero_lot")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as MouvementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllBcLignes() {
  const rows: BcLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, article_id, code, n_doss_4d, n_doss_erp, quantite")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as BcLigneRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllImportEvenements() {
  const rows: ImportEvenementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .select("bc_ligne_id, n_doss_4d_import, n_doss_erp_import, quantite_importee, lot_stock_id")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportEvenementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ article?: string; code?: string; categorie?: string }>;

export default async function StockActuelMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || codeFilter || categorieFilter);

  const [
    { rows: articles, error: articlesError },
    { rows: mouvements, error: mouvementsError },
    { rows: bcLignes, error: bcError },
    { rows: importEvenements, error: importError },
  ] = await Promise.all([
    fetchAllArticlesMp(),
    fetchAllMouvements(),
    fetchAllBcLignes(),
    fetchAllImportEvenements(),
  ]);

  const error = articlesError || mouvementsError || bcError || importError;

  // Stock actuel = somme entree-sortie de tous les mouvements de l'article
  // (meme calcul que Stock Alert MP) - "codes" retient chaque numero de lot
  // deja vu pour cet article, pour que le filtre Code puisse retrouver
  // l'article a partir d'un lot precis meme si ce report reste par article.
  const stockByArticle = new Map<number, number>();
  const codesByArticle = new Map<number, Set<string>>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    const code = (row.numero_lot || "").trim();
    if (code) {
      const set = codesByArticle.get(row.article_id) ?? new Set<string>();
      set.add(code);
      codesByArticle.set(row.article_id, set);
    }
  }

  // Pour chaque article, retrouve les BC (avec leur doss.) qui le
  // concernent, et via leurs lignes les evenements d'import (meme logique
  // que Stock Alert MP) - pour voir tout de suite si un article a une
  // commande/un import en cours.
  const bcRefsByArticle = new Map<number, BcRef[]>();
  const articleByLigneId = new Map<number, number>();
  for (const ligne of bcLignes) {
    if (!ligne.article_id) continue;
    articleByLigneId.set(ligne.id, ligne.article_id);
    const list = bcRefsByArticle.get(ligne.article_id) ?? [];
    list.push({
      code: ligne.code,
      nDoss4d: ligne.n_doss_4d,
      nDossErp: ligne.n_doss_erp,
      quantite: Number(ligne.quantite ?? 0),
    });
    bcRefsByArticle.set(ligne.article_id, list);
  }

  // "Qte importee" par dossier ne compte que les evenements "Creer import"
  // (lot_stock_id null) - une Reception ecrit sa propre ligne dans la meme
  // table pour l'historique, qu'il ne faut pas recompter en plus (meme
  // regle que Stock Alert MP / page Import).
  const importRefsByArticle = new Map<number, Map<string, DossierRef>>();
  for (const evenement of importEvenements) {
    if (evenement.lot_stock_id !== null) continue;
    const articleId = articleByLigneId.get(evenement.bc_ligne_id);
    if (!articleId) continue;
    const key = dossierKey(evenement.n_doss_4d_import, evenement.n_doss_erp_import);
    const map = importRefsByArticle.get(articleId) ?? new Map<string, DossierRef>();
    const existing = map.get(key);
    map.set(key, {
      nDoss4d: evenement.n_doss_4d_import,
      nDossErp: evenement.n_doss_erp_import,
      qteImportee: (existing?.qteImportee ?? 0) + Number(evenement.quantite_importee ?? 0),
    });
    importRefsByArticle.set(articleId, map);
  }

  const stockRows: StockRow[] = articles
    .map((article) => ({
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      stock_actuel: stockByArticle.get(article.id) ?? 0,
      codes: [...(codesByArticle.get(article.id) ?? [])],
      bcRefs: bcRefsByArticle.get(article.id) ?? [],
      importRefs: [...(importRefsByArticle.get(article.id)?.values() ?? [])],
    }))
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !codeFilter || row.codes.some((code) => code.toLowerCase().includes(codeFilter)))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

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
              Stock Actuel MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles matiere premiere avec leur stock actuel (calcule depuis les
              mouvements TE/TS), meme a zero, et les BC/import en cours.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <input
              type="text"
              name="article"
              list="stock-actuel-mp-articles"
              autoComplete="off"
              defaultValue={articleFilter}
              placeholder="Article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="stock-actuel-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (numero de lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="categorie"
              list="stock-actuel-mp-categories"
              autoComplete="off"
              defaultValue={params.categorie || ""}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="stock-actuel-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/stock-actuel"
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
          ) : stockRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold">Commande (BC)</th>
                    <th className="px-6 py-4 font-semibold">Import</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.stock_actuel <= 0
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {formatNumber(row.stock_actuel)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.bcRefs.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {row.bcRefs.map((ref, index) => (
                              <li key={`${ref.code}-${index}`} className="text-xs">
                                <Link
                                  href={`/stock/matiere-premiere/bc/${ref.code}`}
                                  className="font-semibold text-sky-700 underline"
                                >
                                  {ref.code}
                                </Link>{" "}
                                - Qte: {formatNumber(ref.quantite)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.importRefs.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {row.importRefs.map((ref, index) => (
                              <li
                                key={`${dossierKey(ref.nDoss4d, ref.nDossErp)}-${index}`}
                                className="text-xs"
                              >
                                <Link
                                  href={`/stock/matiere-premiere/commande/${encodeDossierId(
                                    ref.nDoss4d,
                                    ref.nDossErp
                                  )}`}
                                  className="font-semibold text-sky-700 underline"
                                >
                                  4D: {ref.nDoss4d || "-"} / ERP: {ref.nDossErp || "-"}
                                </Link>{" "}
                                - Qte: {formatNumber(ref.qteImportee)}
                              </li>
                            ))}
                          </ul>
                        )}
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
