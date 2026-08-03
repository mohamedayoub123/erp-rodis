import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { updateArticleAction } from "./actions";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { ArticlesFilterForm } from "./filter-form";
import { familyRank, articleTypeRank, articleContenanceFromName } from "@/lib/gamme-families";

const PAGE_SIZE = 100;

const ARTICLE_SELECT_FIELDS =
  "id, nom_article, type_article, marque, gamme, min_stock, max_stock, volume_unitaire, volume_stockage, cadence, nb_carton_par_vrac, max_production_vrac_8h, contenance, nb_piece_par_max_vrac, piece_par_carton, min_vrac, max_vrac_auto, vrac_max_manuel, dispenseur_pcs_carton, besoin_pot_flacon, besoin_capsule, besoin_sleeve, besoin_dispenseur, besoin_carton, besoin_etiquette, besoin_etui, code_auto, code_manu";

type ArticleRow = {
  id: number;
  nom_article: string;
  type_article: string | null;
  marque: string | null;
  gamme: string | null;
  min_stock: number | null;
  max_stock: number | null;
  volume_unitaire: number | null;
  volume_stockage: number | null;
  cadence: number | null;
  nb_carton_par_vrac: number | null;
  max_production_vrac_8h: number | null;
  contenance: number | null;
  nb_piece_par_max_vrac: number | null;
  piece_par_carton: number | null;
  min_vrac: number | null;
  max_vrac_auto: number | null;
  vrac_max_manuel: number | null;
  dispenseur_pcs_carton: number | null;
  besoin_pot_flacon: boolean | null;
  besoin_capsule: boolean | null;
  besoin_sleeve: boolean | null;
  besoin_dispenseur: boolean | null;
  besoin_carton: boolean | null;
  besoin_etiquette: boolean | null;
  besoin_etui: boolean | null;
  code_auto: string | null;
  code_manu: string | null;
};

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

// Ces deux colonnes comptent des cartons/pieces (des unites entieres) -
// on affiche un chiffre arrondi sans virgule, meme si la valeur stockee a
// une decimale (ex: 297.6 -> 298).
function formatRounded(value: number | null) {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toString();
}

type SearchParams = Promise<{
  page?: string;
  q?: string;
  type?: string;
  gamme?: string;
}>;

export default async function ArticlesProduitFiniPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentStockUser = await getCurrentStockUser();
  const canWriteArticles = canWritePageUser(currentStockUser, "articlesProduitFiniNouvelle");
  const canEditArticles = canWritePageUser(currentStockUser, "articlesProduitFini");
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const q = (params.q || "").trim();
  const type = (params.type || "").trim();
  const gamme = (params.gamme || "").trim();
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: filterSourceData } = await supabaseServer
    .from("articles")
    .select("nom_article, type_article, gamme")
    .order("nom_article", { ascending: true })
    .limit(5000);

  const { rows: allArticles, error: fetchError } = await fetchAllArticles();

  const qLower = q.toLowerCase();
  const typeLower = type.toLowerCase();
  const gammeLower = gamme.toLowerCase();

  const filteredArticles = allArticles.filter((article) => {
    if (qLower && !String(article.nom_article ?? "").toLowerCase().includes(qLower)) return false;
    if (typeLower && !String(article.type_article ?? "").toLowerCase().includes(typeLower)) return false;
    if (gammeLower && !String(article.gamme ?? "").toLowerCase().includes(gammeLower)) return false;
    return true;
  });

  // Meme ordre que /tableau-commandes : familles (White Secret en premier),
  // puis a l'interieur d'une famille l'ordre par type d'article (Lait,
  // Creme, DSR, Huile, Serum, Savon, Gel douche, EDC, Pommade, Talc), puis
  // par contenance decroissante, puis alphabetique.
  const sortedArticles = [...filteredArticles].sort((a, b) => {
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

  const totalArticles = sortedArticles.length;
  const totalPages = Math.max(1, Math.ceil(totalArticles / PAGE_SIZE));
  const articles = sortedArticles.slice(from, to + 1);
  const effectiveError = fetchError;
  const filterRows =
    (filterSourceData as
      | { nom_article: string; type_article: string | null; gamme: string | null }[]
      | null) ?? [];
  const articleOptions = [...new Set(filterRows.map((row) => row.nom_article).filter(Boolean))];
  const typeOptions = [...new Set(filterRows.map((row) => row.type_article).filter(Boolean))];
  const gammeOptions = [...new Set(filterRows.map((row) => row.gamme).filter(Boolean))];
  const hasFilters = q.length > 0 || type.length > 0 || gamme.length > 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <PersistPageFilters />
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
            <Link
              href="/articles"
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Retour articles
            </Link>
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

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <ArticlesFilterForm
            defaultQ={q}
            defaultType={type}
            defaultGamme={gamme}
            articleOptions={articleOptions}
            typeOptions={typeOptions.filter(Boolean).map((item) => String(item))}
            gammeOptions={gammeOptions.filter(Boolean).map((item) => String(item))}
          />

          {effectiveError ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {effectiveError.message}
              </p>
            </div>
          ) : articles.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun article trouve pour le moment.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Article</th>
                      <th className="px-6 py-4 font-semibold">Type</th>
                      <th className="px-6 py-4 font-semibold">Marque</th>
                      <th className="px-6 py-4 font-semibold">Gamme</th>
                      <th className="px-6 py-4 font-semibold">Min</th>
                      <th className="px-6 py-4 font-semibold">Max</th>
                      <th className="px-6 py-4 font-semibold">Volume unitaire</th>
                      <th className="px-6 py-4 font-semibold">Volume stockage</th>
                      <th className="px-6 py-4 font-semibold">Contenance</th>
                      <th className="px-6 py-4 font-semibold">Cadence</th>
                      <th className="px-6 py-4 font-semibold">Nb carton par vrac</th>
                      <th className="px-6 py-4 font-semibold">Max prod vrac 8h</th>
                      <th className="px-6 py-4 font-semibold">Nb piece par max vrac</th>
                      <th className="px-6 py-4 font-semibold">Piece par carton</th>
                      <th className="px-6 py-4 font-semibold">Min vrac</th>
                      <th className="px-6 py-4 font-semibold">Max vrac auto</th>
                      <th className="px-6 py-4 font-semibold">Vrac max manuel</th>
                      <th className="px-6 py-4 font-semibold">Dispenseur pcs/carton</th>
                      <th className="px-6 py-4 font-semibold">Pot/flacon</th>
                      <th className="px-6 py-4 font-semibold">Capsule</th>
                      <th className="px-6 py-4 font-semibold">Sleeve</th>
                      <th className="px-6 py-4 font-semibold">Dispenseur</th>
                      <th className="px-6 py-4 font-semibold">Carton</th>
                      <th className="px-6 py-4 font-semibold">Etiquette</th>
                      <th className="px-6 py-4 font-semibold">Etui</th>
                      {canEditArticles ? <th className="px-6 py-4 font-semibold">Modifier</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((article) => (
                      <tr key={article.id} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                        <td className="px-6 py-4 text-slate-600">{article.type_article || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.marque || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.min_stock ?? 0}</td>
                        <td className="px-6 py-4 text-slate-600">{article.max_stock ?? 0}</td>
                        <td className="px-6 py-4 text-slate-600">{article.volume_unitaire ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.volume_stockage ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.contenance ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.cadence ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{formatRounded(article.nb_carton_par_vrac)}</td>
                        <td className="px-6 py-4 text-slate-600">{article.max_production_vrac_8h ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{formatRounded(article.nb_piece_par_max_vrac)}</td>
                        <td className="px-6 py-4 text-slate-600">{article.piece_par_carton ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.min_vrac ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.max_vrac_auto ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.vrac_max_manuel ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.dispenseur_pcs_carton ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_pot_flacon ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_capsule ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_sleeve ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_dispenseur ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_carton ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_etiquette ? "Oui" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.besoin_etui ? "Oui" : "-"}</td>
                        {canEditArticles ? (
                          <td className="px-6 py-4">
                            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                                Modifier
                              </summary>

                              <form action={updateArticleAction} className="mt-4 grid gap-3">
                                <input type="hidden" name="article_id" value={article.id} />
                                <input
                                  type="text"
                                  name="nom_article"
                                  defaultValue={article.nom_article}
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  required
                                />
                                <input
                                  type="text"
                                  name="type_article"
                                  defaultValue={article.type_article || ""}
                                  placeholder="Type"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <input
                                  type="text"
                                  name="marque"
                                  defaultValue={article.marque || ""}
                                  placeholder="Marque"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <input
                                  type="text"
                                  name="gamme"
                                  defaultValue={article.gamme || ""}
                                  placeholder="Gamme"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <div className="grid gap-3 md:grid-cols-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    name="min_stock"
                                    defaultValue={article.min_stock ?? 0}
                                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    name="max_stock"
                                    defaultValue={article.max_stock ?? 0}
                                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  />
                                </div>

                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Production
                                </p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Volume unitaire
                                    <input
                                      type="number"
                                      step="0.001"
                                      name="volume_unitaire"
                                      defaultValue={article.volume_unitaire ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Volume stockage
                                    <input
                                      type="number"
                                      step="0.001"
                                      name="volume_stockage"
                                      defaultValue={article.volume_stockage ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Contenance
                                    <input
                                      type="number"
                                      step="0.001"
                                      name="contenance"
                                      defaultValue={article.contenance ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Cadence
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="cadence"
                                      defaultValue={article.cadence ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Nb carton par vrac
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="nb_carton_par_vrac"
                                      defaultValue={article.nb_carton_par_vrac ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Max production vrac 8h
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="max_production_vrac_8h"
                                      defaultValue={article.max_production_vrac_8h ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Nb piece par max vrac
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="nb_piece_par_max_vrac"
                                      defaultValue={article.nb_piece_par_max_vrac ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Piece par carton
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="piece_par_carton"
                                      defaultValue={article.piece_par_carton ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Min vrac
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="min_vrac"
                                      defaultValue={article.min_vrac ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Max vrac auto
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="max_vrac_auto"
                                      defaultValue={article.max_vrac_auto ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Vrac max manuel
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="vrac_max_manuel"
                                      defaultValue={article.vrac_max_manuel ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                    Dispenseur pcs/carton
                                    <input
                                      type="number"
                                      step="0.01"
                                      name="dispenseur_pcs_carton"
                                      defaultValue={article.dispenseur_pcs_carton ?? ""}
                                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                                    />
                                  </label>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                                  {(
                                    [
                                      ["besoin_pot_flacon", "Pot / flacon"],
                                      ["besoin_capsule", "Capsule"],
                                      ["besoin_sleeve", "Sleeve"],
                                      ["besoin_dispenseur", "Dispenseur"],
                                      ["besoin_carton", "Carton"],
                                      ["besoin_etiquette", "Etiquette"],
                                      ["besoin_etui", "Etui"],
                                    ] as const
                                  ).map(([name, label]) => (
                                    <label
                                      key={name}
                                      className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs"
                                    >
                                      <input
                                        type="checkbox"
                                        name={name}
                                        defaultChecked={Boolean(article[name])}
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>

                                <div>
                                  <button
                                    type="submit"
                                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                  >
                                    Enregistrer
                                  </button>
                                </div>
                              </form>
                            </details>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
                <p className="text-slate-500">
                  Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalArticles)} sur {totalArticles}
                </p>

                <div className="flex gap-3">
                  <Link
                    href={`/articles/produit-fini?page=1&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&gamme=${encodeURIComponent(gamme)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Premiere
                  </Link>
                  <Link
                    href={`/articles/produit-fini?page=${Math.max(1, currentPage - 1)}&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&gamme=${encodeURIComponent(gamme)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Precedent
                  </Link>
                  <Link
                    href={`/articles/produit-fini?page=${Math.min(totalPages, currentPage + 1)}&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&gamme=${encodeURIComponent(gamme)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Suivant
                  </Link>
                  <Link
                    href={`/articles/produit-fini?page=${totalPages}&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&gamme=${encodeURIComponent(gamme)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Derniere
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
