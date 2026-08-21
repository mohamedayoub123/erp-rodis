import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { encodeDossierId } from "../commande/dossier-id";
import { computeStatutBc } from "../bc/constants";

type StockActuelMpRpcRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
  codes: string[] | null;
};

type BcLigneRow = {
  id: number;
  article_id: number | null;
  code: string;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  quantite: number | null;
  statut: string | null;
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

// Le stock par article (somme de tous les mouvements TE/TS) est calcule
// directement en base (fonction stock_actuel_mp_rows, voir
// scripts/sql/add_stock_actuel_rpcs.sql) - avant, cette page rapatriait
// TOUTE la table lots_stock_matiere_premiere (un journal de mouvements qui
// ne fait que grossir) pour la sommer en JS a chaque chargement.
async function fetchStockActuelMp() {
  const { data, error } = await supabaseServer.rpc("stock_actuel_mp_rows");
  if (error) return { rows: [] as StockActuelMpRpcRow[], error };
  return { rows: (data ?? []) as StockActuelMpRpcRow[], error: null };
}

async function fetchAllBcLignes() {
  const rows: BcLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, article_id, code, n_doss_4d, n_doss_erp, quantite, statut")
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
    { rows: bcLignes, error: bcError },
    { rows: importEvenements, error: importError },
  ] = await Promise.all([fetchStockActuelMp(), fetchAllBcLignes(), fetchAllImportEvenements()]);

  const error = articlesError || bcError || importError;

  // "Qte importee TOTALE" (tous evenements confondus, receptionnes ou pas)
  // sert uniquement a calculer le statut (voir computeStatutBc) - a ne pas
  // confondre avec importRefsByArticle plus bas, filtre sur lot_stock_id
  // null pour l'affichage "en cours d'import pas encore receptionne". Sans
  // ce total non filtre, un BC entierement receptionne retomberait a "Qte
  // importee=0" et resterait affiche comme si sa quantite etait encore a
  // commander - meme correctif que sur Stock Alert MP / statistique.
  const quantiteImporteeTotaleByLigneId = new Map<number, number>();
  for (const evenement of importEvenements) {
    quantiteImporteeTotaleByLigneId.set(
      evenement.bc_ligne_id,
      (quantiteImporteeTotaleByLigneId.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
    );
  }

  // Pour chaque article, retrouve les BC (avec leur doss.) qui le
  // concernent, et via leurs lignes les evenements d'import (meme logique
  // que Stock Alert MP) - pour voir tout de suite si un article a une
  // commande/un import en cours. Un BC deja Termine (entierement
  // receptionne/transfere en stock) est exclu, sinon sa quantite commandee
  // restait affichee ici pour toujours (bug reel signale).
  const bcRefsByArticle = new Map<number, BcRef[]>();
  const articleByLigneId = new Map<number, number>();
  for (const ligne of bcLignes) {
    if (!ligne.article_id) continue;
    articleByLigneId.set(ligne.id, ligne.article_id);
    const quantite = Number(ligne.quantite ?? 0);
    const quantiteImportee = quantiteImporteeTotaleByLigneId.get(ligne.id) ?? 0;
    if (computeStatutBc(quantite, quantiteImportee, ligne.statut) === "Termine") continue;
    const list = bcRefsByArticle.get(ligne.article_id) ?? [];
    list.push({
      code: ligne.code,
      nDoss4d: ligne.n_doss_4d,
      nDossErp: ligne.n_doss_erp,
      quantite,
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
      article_id: article.article_id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      stock_actuel: Number(article.stock_actuel ?? 0),
      codes: article.codes ?? [],
      bcRefs: bcRefsByArticle.get(article.article_id) ?? [],
      importRefs: [...(importRefsByArticle.get(article.article_id)?.values() ?? [])],
    }))
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !codeFilter || row.codes.some((code) => code.toLowerCase().includes(codeFilter)))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map((label, id) => ({
    id,
    label,
  }));
  const categorieOptions = ([...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[]).map(
    (label, id) => ({ id, label })
  );
  const codeOptions = [...new Set(articles.flatMap((article) => article.codes ?? []))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Categorie", key: "categorie" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stockActuel" },
    { label: "Commande (BC)", key: "commandeBc" },
    { label: "Import", key: "import" },
  ];

  const exportRows = stockRows.map((row) => ({
    article: row.nom_article,
    categorie: row.categorie || "-",
    unite: row.unite || "-",
    stockActuel: row.stock_actuel,
    commandeBc: row.bcRefs.length
      ? row.bcRefs.map((ref) => `${ref.code} - Qte: ${ref.quantite}`).join(" | ")
      : "-",
    import: row.importRefs.length
      ? row.importRefs
          .map((ref) => `4D: ${ref.nDoss4d || "-"} / ERP: ${ref.nDossErp || "-"} - Qte: ${ref.qteImportee}`)
          .join(" | ")
      : "-",
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
              Stock Actuel MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles matiere premiere avec leur stock actuel (calcule depuis les
              mouvements TE/TS), meme a zero, et les BC/import en cours.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`stock-actuel-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
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
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code (numero de lot)"
            />
            <SearchableFilterInput
              name="categorie"
              defaultValue={params.categorie || ""}
              options={categorieOptions}
              placeholder="Categorie..."
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
