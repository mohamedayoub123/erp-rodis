import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { encodeDossierId } from "../commande/dossier-id";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_stock: number | null;
  max_stock: number | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  date_jour: string | null;
};

type AlerteRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
  min_stock: number;
  entree_12_mois: number;
  sortie_12_mois: number;
  entree_3_mois: number;
  sortie_3_mois: number;
  bcRefs: BcRef[];
  importRefs: DossierRef[];
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

type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  date_prevue_reception: string | null;
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
  datePrevueReception: string | null;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite, min_stock, max_stock")
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

async function fetchAllDossierStatuts() {
  const { data, error } = await supabaseServer
    .from("dossiers_import_mp_statut")
    .select("n_doss_4d, n_doss_erp, date_prevue_reception");

  if (error) return { rows: [] as DossierStatutRow[], error };

  return { rows: (data ?? []) as DossierStatutRow[], error: null };
}

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{
  q?: string;
  categorie?: string;
}>;

export default async function StockAlerteMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categorieFilter = (params.categorie || "").trim();
  const qLower = q.toLowerCase();
  const categorieLower = categorieFilter.toLowerCase();

  const [
    { rows: articles, error: articlesError },
    { rows: mouvements, error: mouvementsError },
    { rows: bcLignes, error: bcError },
    { rows: importEvenements, error: importError },
    { rows: dossierStatuts, error: statutError },
  ] = await Promise.all([
    fetchAllArticlesMp(),
    fetchAllMouvements(),
    fetchAllBcLignes(),
    fetchAllImportEvenements(),
    fetchAllDossierStatuts(),
  ]);

  const error = articlesError || mouvementsError || bcError || importError || statutError;

  const datePrevueByDossier = new Map(
    dossierStatuts.map((row) => [dossierKey(row.n_doss_4d, row.n_doss_erp), row.date_prevue_reception])
  );

  // Stock actuel = somme entree-sortie de tous les mouvements de l'article
  // (meme calcul que la page Stock MP). Alerte des que ce stock descend a
  // ou sous le seuil "Stock min" defini sur l'article.
  const stockByArticle = new Map<number, number>();
  // Entree/Sortie des 12 et 3 derniers mois (date_jour, meme convention
  // "AAAA-MM-JJ" que le reste de l'appli - comparaison de chaines directe) -
  // donne un apercu de la vitesse de consommation/reapprovisionnement d'un
  // article en alerte, sans avoir a rouvrir Stock MP.
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthsAgoIso = twelveMonthsAgo.toISOString().slice(0, 10);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoIso = threeMonthsAgo.toISOString().slice(0, 10);
  const entree12MoisByArticle = new Map<number, number>();
  const sortie12MoisByArticle = new Map<number, number>();
  const entree3MoisByArticle = new Map<number, number>();
  const sortie3MoisByArticle = new Map<number, number>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    if (row.date_jour && row.date_jour >= twelveMonthsAgoIso) {
      entree12MoisByArticle.set(
        row.article_id,
        (entree12MoisByArticle.get(row.article_id) ?? 0) + Number(row.qte_entree ?? 0)
      );
      sortie12MoisByArticle.set(
        row.article_id,
        (sortie12MoisByArticle.get(row.article_id) ?? 0) + Number(row.qte_sortie ?? 0)
      );

      if (row.date_jour >= threeMonthsAgoIso) {
        entree3MoisByArticle.set(
          row.article_id,
          (entree3MoisByArticle.get(row.article_id) ?? 0) + Number(row.qte_entree ?? 0)
        );
        sortie3MoisByArticle.set(
          row.article_id,
          (sortie3MoisByArticle.get(row.article_id) ?? 0) + Number(row.qte_sortie ?? 0)
        );
      }
    }
  }

  // Pour chaque article, retrouve les BC (avec leur doss.) qui le
  // concernent, et via leurs lignes les evenements d'import (avec leur
  // propre doss., qui peut differer du doss. de la BC) - pour voir tout de
  // suite si un article en alerte est deja commande/en cours d'import.
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
  // regle que la page Import, voir commande/[id]/page.tsx).
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
      datePrevueReception: datePrevueByDossier.get(key) ?? null,
    });
    importRefsByArticle.set(articleId, map);
  }

  const alertes: AlerteRow[] = articles
    .filter((article) => article.min_stock !== null)
    .map((article) => ({
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      stock_actuel: stockByArticle.get(article.id) ?? 0,
      min_stock: article.min_stock as number,
      entree_12_mois: entree12MoisByArticle.get(article.id) ?? 0,
      sortie_12_mois: sortie12MoisByArticle.get(article.id) ?? 0,
      entree_3_mois: entree3MoisByArticle.get(article.id) ?? 0,
      sortie_3_mois: sortie3MoisByArticle.get(article.id) ?? 0,
      bcRefs: bcRefsByArticle.get(article.id) ?? [],
      importRefs: [...(importRefsByArticle.get(article.id)?.values() ?? [])],
    }))
    .filter((row) => row.stock_actuel <= row.min_stock)
    .filter((row) => !qLower || matchesArticleSearch(row.nom_article, qLower))
    .filter((row) => !categorieLower || (row.categorie || "").toLowerCase().includes(categorieLower))
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
              Stock Alert MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Articles dont le stock actuel (calcule depuis les mouvements TE/TS) est egal ou
              inferieur au stock min defini sur l&apos;article.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              name="q"
              list="alerte-mp-articles"
              autoComplete="off"
              defaultValue={q}
              placeholder="Rechercher un article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="alerte-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="categorie"
              list="alerte-mp-categories"
              autoComplete="off"
              defaultValue={categorieFilter}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="alerte-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : alertes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucune alerte pour le moment : aucun article n&apos;est a ou sous son stock min.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Total sortie (12 mois)</th>
                    <th className="px-6 py-4 font-semibold">Total entree (12 mois)</th>
                    <th className="px-6 py-4 font-semibold">Total sortie (3 mois)</th>
                    <th className="px-6 py-4 font-semibold">Total entree (3 mois)</th>
                    <th className="px-6 py-4 font-semibold">Stock alert</th>
                    <th className="px-6 py-4 font-semibold">Commande (BC)</th>
                    <th className="px-6 py-4 font-semibold">Import</th>
                    <th className="px-6 py-4 font-semibold">Utilisation</th>
                  </tr>
                </thead>
                <tbody>
                  {alertes.map((alerte) => (
                    <tr key={alerte.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 text-slate-600">{alerte.categorie || "-"}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{alerte.nom_article}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          {formatNumber(alerte.stock_actuel)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{alerte.unite || "-"}</td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.sortie_12_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-emerald-700">
                        {formatNumber(alerte.entree_12_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.sortie_3_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-emerald-700">
                        {formatNumber(alerte.entree_3_mois)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(alerte.min_stock)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {alerte.bcRefs.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {alerte.bcRefs.map((ref, index) => (
                              <li key={`${ref.code}-${index}`} className="text-xs">
                                <Link
                                  href={`/stock/matiere-premiere/bc/${ref.code}`}
                                  className="font-semibold text-sky-700 underline"
                                >
                                  {ref.code}
                                </Link>{" "}
                                - Qte commandee: {formatNumber(ref.quantite)} - 4D: {ref.nDoss4d || "-"} / ERP:{" "}
                                {ref.nDossErp || "-"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {alerte.importRefs.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {alerte.importRefs.map((ref, index) => (
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
                                - Qte importee: {formatNumber(ref.qteImportee)} - Arrivee prevue:{" "}
                                {ref.datePrevueReception ? formatDate(ref.datePrevueReception) : "-"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {formatNumber(alerte.sortie_12_mois / 12)} / mois
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
