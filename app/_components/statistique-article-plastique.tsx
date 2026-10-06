import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { SubmitButton } from "@/app/_components/submit-button";
import { SaveCommandeButton } from "@/app/_components/save-commande-plastique-button";
import { matchesArticleSearch } from "@/lib/article-search";
import { familyRank } from "@/lib/gamme-families";
import { CATEGORIE_PLASTIQUE } from "@/app/production-plastique/shared";
import {
  updateAvisFabricationAction,
  updateMachinePlastiqueAction,
  updateNbCavitesAction,
  saveCommandeArticlePlastiqueAction,
} from "@/app/_components/statistique-article-plastique-actions";

// Module partage - meme rendu utilise depuis Rapport MP
// (stock/matiere-premiere/rapport/plastique) et Production Plastique
// (production-plastique/statistique), demande explicite : "la meme
// module" aux 2 endroits plutot que 2 versions dupliquees a maintenir
// separement.

type StockActuelMpRpcRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
  stock_actuel: number;
};

type ArticleDetailRow = {
  id: number;
  sous_famille: string | null;
  min_stock: number | null;
  max_stock: number | null;
  gamme: string | null;
  avis_fabrication: string | null;
  // Colonnes ajoutees par scripts/sql/add_machine_cavites_articles_matiere_premiere.sql
  machine_plastique?: string | null;
  nb_cavites?: number | null;
};

export type PlastiqueRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  // Type du ou des produits finis dont la recette de conditionnement contient cet article
  // (ex: "Gel douche", "Clarifiant") ; vide si l'article n'est dans aucune recette.
  types_produit: string[];
  unite: string | null;
  gamme: string | null;
  stock_actuel: number;
  min_stock: number | null;
  max_stock: number | null;
  avis_fabrication: string | null;
  // Saisis a la main : machine sur laquelle l'article travaille (vide = aucune) et cavites du moule
  machine: string | null;
  nb_cavites: number | null;
};

// "gel douche" -> "Gel douche" (articles.type_article est saisi a la main, casse variable).
function typeAffiche(type: string): string {
  const propre = type.trim();
  return propre ? propre.charAt(0).toUpperCase() + propre.slice(1).toLowerCase() : "";
}

// Types des produits finis qui utilisent chaque article plastique : on cherche l'article dans
// les recettes de CONDITIONNEMENT (recettes_pf des produits finis, nature differente de "vrac"),
// puis on prend le type (clarifiant, gel douche...) de chaque produit fini trouve.
async function fetchTypesParArticlePlastique(articleIds: number[]): Promise<Map<number, string[]>> {
  const resultat = new Map<number, string[]>();
  if (articleIds.length === 0) return resultat;

  // article plastique -> produits finis (recettes)
  const produitsParArticle = new Map<number, Set<number>>();
  const tailleLot = 50;
  for (let i = 0; i < articleIds.length; i += tailleLot) {
    const lot = articleIds.slice(i, i + tailleLot);
    const taillePage = 1000;
    for (let depart = 0; ; depart += taillePage) {
      const { data, error } = await supabaseServer
        .from("recettes_pf")
        .select("id, article_pf_id, article_mp_id")
        .in("article_mp_id", lot)
        .order("id", { ascending: true })
        .range(depart, depart + taillePage - 1);
      if (error) return resultat;
      const page = (data ?? []) as { id: number; article_pf_id: number; article_mp_id: number }[];
      for (const ligne of page) {
        const set = produitsParArticle.get(ligne.article_mp_id) ?? new Set<number>();
        set.add(ligne.article_pf_id);
        produitsParArticle.set(ligne.article_mp_id, set);
      }
      if (page.length < taillePage) break;
    }
  }

  // produit fini -> type (seulement les produits finis : la recette de conditionnement)
  const idsProduits = [...new Set([...produitsParArticle.values()].flatMap((s) => [...s]))];
  const typeParProduit = new Map<number, string>();
  for (let i = 0; i < idsProduits.length; i += 200) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nature, type_article")
      .in("id", idsProduits.slice(i, i + 200));
    if (error) return resultat;
    for (const produit of (data ?? []) as { id: number; nature: string | null; type_article: string | null }[]) {
      if (produit.nature === "vrac") continue;
      const type = typeAffiche(produit.type_article ?? "");
      if (type) typeParProduit.set(produit.id, type);
    }
  }

  for (const [articleId, produits] of produitsParArticle) {
    const types = [...new Set([...produits].map((id) => typeParProduit.get(id)).filter((t): t is string => !!t))];
    types.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    resultat.set(articleId, types);
  }
  return resultat;
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Sous-type precis (sous_famille) deja normalise au catalogue (CAPSULE,
// FLACON, FLACON PET, POT, POT PET...) - FLACON et FLACON PET restent
// distincts ici (demande explicite : l'ordre de tri doit pouvoir les
// distinguer), contrairement a normalizeCategoriePlastique
// (production-plastique/shared.ts) qui n'a plus besoin de les fusionner
// non plus depuis que le catalogue est normalise.
function displayCategorie(categorie: string | null): string {
  return categorie || "-";
}

// Ordre d'affichage demande explicitement : Flacon, Pot, Capsule, Flacon
// PET - tout le reste (Topette...) vient apres, triees entre elles par nom.
// POT PET place juste apres FLACON PET (meme logique : variante PET
// distincte de sa famille de base, voir displayCategorie).
const CATEGORIE_SORT_ORDER = ["FLACON", "POT", "CAPSULE", "FLACON PET", "POT PET"];
function categorieSortIndex(categorie: string | null): number {
  const index = CATEGORIE_SORT_ORDER.indexOf(displayCategorie(categorie));
  return index === -1 ? CATEGORIE_SORT_ORDER.length : index;
}

// stock_actuel_mp_rows() renvoie une ligne par article MP (2700+) - un
// simple .rpc() sans .range() plafonne silencieusement a 1000 lignes
// (limite par defaut Supabase/PostgREST), qui coupait la table AVANT
// d'atteindre la plupart des articles plastique (aucun ordre garanti sur
// une fonction SQL sans ORDER BY) - cette page revenait vide. Meme
// pagination que fetchAllRows ailleurs dans l'appli.
async function fetchAllStockActuelMpRows(): Promise<{ rows: StockActuelMpRpcRow[]; error: string | null }> {
  const pageSize = 1000;
  const rows: StockActuelMpRpcRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_actuel_mp_rows").range(from, from + pageSize - 1);
    if (error) return { rows: [], error: error.message };
    const chunk = (data ?? []) as StockActuelMpRpcRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

const COLONNES_DETAIL = "id, sous_famille, min_stock, max_stock, gamme, avis_fabrication";

// Lit les details des articles plastique avec Machine/Cavites ; tant que le script SQL
// n'a pas ete lance (colonnes absentes), relit sans eux pour que la page reste utilisable.
async function lireDetailsPlastique(): Promise<{
  data: ArticleDetailRow[] | null;
  error: string | null;
  machineCavitesPret: boolean;
}> {
  const complet = await supabaseServer
    .from("articles_matiere_premiere")
    .select(`${COLONNES_DETAIL}, machine_plastique, nb_cavites`)
    .eq("categorie", CATEGORIE_PLASTIQUE);
  if (!complet.error) {
    return { data: complet.data as unknown as ArticleDetailRow[], error: null, machineCavitesPret: true };
  }

  const simple = await supabaseServer
    .from("articles_matiere_premiere")
    .select(COLONNES_DETAIL)
    .eq("categorie", CATEGORIE_PLASTIQUE);
  return {
    data: simple.error ? null : (simple.data as unknown as ArticleDetailRow[]),
    error: simple.error?.message ?? null,
    machineCavitesPret: false,
  };
}

export async function fetchPlastiqueRows(): Promise<{
  rows: PlastiqueRow[];
  error: string | null;
  machineCavitesPret: boolean;
}> {
  const [stockResult, detailResult] = await Promise.all([fetchAllStockActuelMpRows(), lireDetailsPlastique()]);

  if (stockResult.error) return { rows: [], error: stockResult.error, machineCavitesPret: false };
  if (detailResult.error || !detailResult.data) {
    return { rows: [], error: detailResult.error ?? "Lecture des articles impossible.", machineCavitesPret: false };
  }

  const detailById = new Map(detailResult.data.map((row) => [row.id, row]));
  const typesParArticle = await fetchTypesParArticlePlastique(
    stockResult.rows.filter((row) => row.categorie === CATEGORIE_PLASTIQUE).map((row) => row.article_id)
  );

  const rows = stockResult.rows
    .filter((row) => row.categorie === CATEGORIE_PLASTIQUE)
    .map((row) => {
      const detail = detailById.get(row.article_id);
      return {
        article_id: row.article_id,
        nom_article: row.nom_article,
        // Sous famille lue sur l'article (la fonction SQL ne la renvoie pas toujours)
        categorie: detail?.sous_famille ?? row.sous_famille ?? null,
        types_produit: typesParArticle.get(row.article_id) ?? [],
        unite: row.unite,
        gamme: detail?.gamme ?? null,
        stock_actuel: Number(row.stock_actuel ?? 0),
        min_stock: detail?.min_stock ?? null,
        max_stock: detail?.max_stock ?? null,
        avis_fabrication: detail?.avis_fabrication ?? null,
        machine: detail?.machine_plastique ?? null,
        nb_cavites: detail?.nb_cavites ?? null,
      };
    })
    .sort((a, b) => {
      return (
        familyRank(a.gamme) - familyRank(b.gamme) ||
        (a.gamme || "").localeCompare(b.gamme || "", "fr", { sensitivity: "base" }) ||
        categorieSortIndex(a.categorie) - categorieSortIndex(b.categorie) ||
        a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" })
      );
    });

  return { rows, error: null, machineCavitesPret: detailResult.machineCavitesPret };
}

// Quantite a fabriquer pour ramener le stock au maximum - seulement quand
// le stock est sous le minimum (sinon rien a produire dans l'urgence) et
// que min/max sont tous les 2 renseignes pour cet article (sinon aucune
// cible fiable a viser).
export function computeAFabriquer(row: PlastiqueRow): number | null {
  if (row.min_stock === null || row.max_stock === null) return null;
  if (row.stock_actuel >= row.min_stock) return 0;
  return Math.max(0, row.max_stock - row.stock_actuel);
}

// Stock critique = 60 % du stock min (null tant que le stock min n'est pas renseigne).
export const POURCENTAGE_STOCK_CRITIQUE = 0.6;

export function computeStockCritique(row: PlastiqueRow): number | null {
  if (row.min_stock === null) return null;
  return row.min_stock * POURCENTAGE_STOCK_CRITIQUE;
}

// Seuil d'arret = stock max moins 20 % (80 % du max) : une fois le stock arrive
// a ce niveau, on arrete la production (null tant que le stock max n'est pas renseigne).
export const POURCENTAGE_SEUIL_ARRET = 0.8;

export function computeSeuilArret(row: PlastiqueRow): number | null {
  if (row.max_stock === null) return null;
  return row.max_stock * POURCENTAGE_SEUIL_ARRET;
}

// true = le stock a atteint le seuil d'arret ; null = pas de stock max pour decider
export function doitArreterProduction(row: PlastiqueRow): boolean | null {
  const seuil = computeSeuilArret(row);
  if (seuil === null) return null;
  return row.stock_actuel >= seuil;
}

export async function StatistiqueArticlePlastique({
  pageHref,
  canEdit,
  searchParams,
}: {
  pageHref: string;
  canEdit: boolean;
  searchParams: Promise<{ q?: string; categorie?: string; type?: string; gamme?: string }>;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categorieFilter = (params.categorie || "").trim();
  const typeFilter = (params.type || "").trim();
  const gammeFilter = (params.gamme || "").trim();
  const hasFilters = Boolean(q || categorieFilter || typeFilter || gammeFilter);

  const { rows: allRows, error, machineCavitesPret } = await fetchPlastiqueRows();

  const rows = allRows
    .filter((row) => !q || matchesArticleSearch(row.nom_article, q))
    .filter((row) => !categorieFilter || displayCategorie(row.categorie) === categorieFilter)
    // Type : un article utilise par plusieurs types (ex. "Clarifiant, Hydratant") ressort pour chacun
    .filter(
      (row) =>
        !typeFilter || row.types_produit.some((type) => type.toLowerCase() === typeFilter.toLowerCase())
    )
    .filter((row) => !gammeFilter || (row.gamme || "").toLowerCase() === gammeFilter.toLowerCase());

  const articleOptions = allRows.map((row, index) => ({ id: index, label: row.nom_article }));
  const categorieOptions = [...new Set(allRows.map((row) => displayCategorie(row.categorie)))].map(
    (label, index) => ({ id: index, label })
  );
  const typeOptions = [...new Set(allRows.flatMap((row) => row.types_produit))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, index) => ({ id: index, label }));
  const gammeOptions = [...new Set(allRows.map((row) => row.gamme).filter((g): g is string => Boolean(g)))].map(
    (label, index) => ({ id: index, label })
  );

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Gamme", key: "gamme" },
    { label: "Sous famille", key: "categorie" },
    { label: "Type", key: "type" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stock" },
    { label: "Stock min", key: "min" },
    { label: "Stock critique", key: "critique" },
    { label: "Stock max", key: "max" },
    { label: "Stock max - 20 %", key: "seuilArret" },
    { label: "Demarrer la production ?", key: "arret" },
    { label: "A fabriquer", key: "aFabriquer" },
    { label: "Avis de fabrication", key: "avis" },
    { label: "Machine", key: "machine" },
    { label: "Cavites", key: "cavites" },
  ];
  const exportRows = rows.map((row) => ({
    article: row.nom_article,
    gamme: row.gamme || "-",
    categorie: displayCategorie(row.categorie),
    type: row.types_produit.length > 0 ? row.types_produit.join(", ") : "-",
    unite: row.unite || "-",
    stock: row.stock_actuel,
    min: row.min_stock ?? "-",
    critique: computeStockCritique(row) ?? "-",
    max: row.max_stock ?? "-",
    seuilArret: computeSeuilArret(row) ?? "-",
    arret: (() => {
      const arret = doitArreterProduction(row);
      return arret === null ? "-" : arret ? "Ne pas demarrer" : "Demarrer";
    })(),
    aFabriquer: computeAFabriquer(row) ?? "-",
    avis: row.avis_fabrication || "-",
    machine: row.machine || "-",
    cavites: row.nb_cavites ?? "-",
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <form className="grid gap-3 sm:grid-cols-4">
          <SearchableFilterInput name="q" defaultValue={q} options={articleOptions} placeholder="Article..." />
          <SearchableFilterInput
            name="categorie"
            defaultValue={categorieFilter}
            options={categorieOptions}
            placeholder="Sous famille..."
          />
          <SearchableFilterInput name="type" defaultValue={typeFilter} options={typeOptions} placeholder="Type..." />
          <SearchableFilterInput name="gamme" defaultValue={gammeFilter} options={gammeOptions} placeholder="Gamme..." />
          <div className="flex flex-wrap gap-3 sm:col-span-4">
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href={pageHref}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {canEdit ? <SaveCommandeButton saveAction={saveCommandeArticlePlastiqueAction} /> : null}
              <ExportExcelButton
                rows={exportRows}
                columns={exportColumns}
                filename={`statistique-article-plastique-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
            </div>
          </div>
        </form>
      </section>

      {!error && !machineCavitesPret ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Machine et Cavites ne sont pas encore actives : lance d&apos;abord le script SQL
          add_machine_cavites_articles_matiere_premiere.sql dans Supabase (SQL Editor).
        </p>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {error ? (
          <p className="px-6 py-8 text-sm font-medium text-red-700">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article plastique trouve."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article</th>
                  <th className="px-6 py-4 font-semibold">Gamme</th>
                  <th className="px-6 py-4 font-semibold">Sous famille</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Unite</th>
                  <th className="px-6 py-4 font-semibold">Stock actuel</th>
                  <th className="px-6 py-4 font-semibold">Stock min</th>
                  <th className="px-6 py-4 font-semibold">Stock critique</th>
                  <th className="px-6 py-4 font-semibold">Stock max</th>
                  <th className="px-6 py-4 font-semibold">Stock max - 20 %</th>
                  <th className="px-6 py-4 font-semibold">Demarrer la production ?</th>
                  <th className="px-6 py-4 font-semibold">A fabriquer</th>
                  <th className="px-6 py-4 font-semibold">Avis de fabrication</th>
                  <th className="px-6 py-4 font-semibold">Machine</th>
                  <th className="px-6 py-4 font-semibold">Cavites</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Rouge = sous le minimum (a commander/produire), ambre =
                  // au-dessus du maximum (surstock), vert = dans la
                  // fourchette - memes couleurs que Stock Alert MP, seuils
                  // ignores quand min/max ne sont pas renseignes pour cet
                  // article.
                  const belowMin = row.min_stock !== null && row.stock_actuel < row.min_stock;
                  const aboveMax = row.max_stock !== null && row.stock_actuel > row.max_stock;
                  const badgeClass = belowMin
                    ? "bg-rose-100 text-rose-800"
                    : aboveMax
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800";
                  const aFabriquer = computeAFabriquer(row);
                  const critique = computeStockCritique(row);
                  const seuilArret = computeSeuilArret(row);
                  const arret = doitArreterProduction(row);
                  return (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.gamme || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{displayCategorie(row.categorie)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.types_produit.length > 0 ? row.types_produit.join(", ") : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                          {formatNumber(row.stock_actuel)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.min_stock !== null ? formatNumber(row.min_stock) : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {critique !== null ? formatNumber(critique) : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.max_stock !== null ? formatNumber(row.max_stock) : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {seuilArret !== null ? formatNumber(seuilArret) : "-"}
                      </td>
                      <td className="px-6 py-4">
                        {arret === null ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              arret ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {arret ? "Ne pas demarrer" : "Demarrer"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-red-600">
                        {aFabriquer ? formatNumber(aFabriquer) : "-"}
                      </td>
                      <td className="px-6 py-4">
                        {canEdit ? (
                          <form action={updateAvisFabricationAction} className="flex items-center gap-2">
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <input
                              type="text"
                              name="avis_fabrication"
                              defaultValue={row.avis_fabrication ?? ""}
                              placeholder="Avis..."
                              className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              OK
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-slate-600">{row.avis_fabrication || "-"}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canEdit && machineCavitesPret ? (
                          <form action={updateMachinePlastiqueAction} className="flex items-center gap-2">
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <input
                              type="text"
                              name="machine"
                              defaultValue={row.machine ?? ""}
                              placeholder="Machine..."
                              maxLength={100}
                              className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              OK
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-slate-600">{row.machine || "-"}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canEdit && machineCavitesPret ? (
                          <form action={updateNbCavitesAction} className="flex items-center gap-2">
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <input
                              type="number"
                              name="nb_cavites"
                              defaultValue={row.nb_cavites ?? ""}
                              placeholder="Nb"
                              min="1"
                              max="999"
                              step="1"
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              OK
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-slate-600">{row.nb_cavites ?? "-"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
