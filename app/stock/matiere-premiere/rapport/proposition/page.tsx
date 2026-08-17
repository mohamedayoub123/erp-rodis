import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_stock: number | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  date_jour: string | null;
};

type BcLigneRow = {
  id: number;
  article_id: number | null;
  quantite: number | null;
};

type ImportEvenementRow = {
  bc_ligne_id: number;
  quantite_importee: number;
  lot_stock_id: number | null;
};

type PropositionRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_stock: number | null;
  stock_actuel: number;
  deja_en_commande: number;
  objectif: number;
  a_commander: number;
};

const MOIS_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Meme calcul que Besoin Commande MP : objectif pour un mois de depart =
// somme de la consommation reelle de ce mois-la et des 8 suivants (3 mois
// de delai de livraison + 6 mois de cycle de commande, sur les 12 derniers
// mois, un seul passage par mois calendaire - la consommation varie selon
// le mois, ce n'est pas une moyenne fixe).
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
      .select("id, nom_article, categorie, unite, min_stock")
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
      .select("id, article_id, quantite")
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
      .select("bc_ligne_id, quantite_importee, lot_stock_id")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportEvenementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ mois?: string; article?: string; categorie?: string }>;

export default async function PropositionCommandeMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();

  const moisParam = Number(params.mois);
  const moisIdx =
    Number.isInteger(moisParam) && moisParam >= 1 && moisParam <= 12
      ? moisParam - 1
      : new Date().getMonth();

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const sinceDate = twelveMonthsAgo.toISOString().slice(0, 10);

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

  // Quantite deja en commande/import pas encore receptionnee, par ligne de
  // BC : quantite commandee - ce qui a deja ete receptionne pour cette
  // ligne (evenements avec lot_stock_id renseigne = vraie reception qui a
  // credite le stock). On la retire de l'objectif : pas la peine de
  // proposer une commande pour ce qui arrive deja.
  const receptionneParLigne = new Map<number, number>();
  for (const evenement of importEvenements) {
    if (evenement.lot_stock_id === null) continue;
    receptionneParLigne.set(
      evenement.bc_ligne_id,
      (receptionneParLigne.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
    );
  }

  const dejaEnCommandeByArticle = new Map<number, number>();
  for (const ligne of bcLignes) {
    if (!ligne.article_id) continue;
    const receptionne = receptionneParLigne.get(ligne.id) ?? 0;
    const enAttente = Math.max(0, Number(ligne.quantite ?? 0) - receptionne);
    dejaEnCommandeByArticle.set(
      ligne.article_id,
      (dejaEnCommandeByArticle.get(ligne.article_id) ?? 0) + enAttente
    );
  }

  // Stock actuel = somme entree-sortie de TOUS les mouvements (meme calcul
  // que Stock MP). Consommation par mois calendaire = sortie des 12
  // derniers mois seulement, regroupee par mois (Janvier, Fevrier...).
  // Objectif du mois choisi = besoin des 9 mois a partir de ce mois-la (3
  // de delai de livraison + 6 de cycle de commande, meme formule que
  // Besoin Commande MP). A commander = objectif moins ce
  // qu'il reste deja en stock ET moins ce qui est deja en commande/import
  // (jamais negatif - si stock + deja-commande couvrent deja l'objectif,
  // rien a commander, l'article n'apparait pas).
  const stockByArticle = new Map<number, number>();
  const consommationByArticleAndMois = new Map<number, number[]>();

  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    if (!row.date_jour || row.date_jour < sinceDate) continue;
    const idx = Number(row.date_jour.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    if (!consommationByArticleAndMois.has(row.article_id)) {
      consommationByArticleAndMois.set(row.article_id, new Array(12).fill(0));
    }
    consommationByArticleAndMois.get(row.article_id)![idx] += Number(row.qte_sortie ?? 0);
  }

  const propositionRows: PropositionRow[] = articles
    .map((article) => {
      const stockActuel = stockByArticle.get(article.id) ?? 0;
      const dejaEnCommande = dejaEnCommandeByArticle.get(article.id) ?? 0;
      const consommationParMoisCalendaire = consommationByArticleAndMois.get(article.id) ?? new Array(12).fill(0);
      const objectif = objectifGlissant(consommationParMoisCalendaire, moisIdx);
      const aCommander = Math.max(0, Math.round((objectif - stockActuel - dejaEnCommande) * 100) / 100);

      return {
        article_id: article.id,
        nom_article: article.nom_article,
        categorie: article.categorie,
        unite: article.unite,
        min_stock: article.min_stock,
        stock_actuel: stockActuel,
        deja_en_commande: dejaEnCommande,
        objectif,
        a_commander: aCommander,
      };
    })
    .filter((row) => row.a_commander > 0)
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => b.a_commander - a.a_commander);

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map((label, id) => ({
    id,
    label,
  }));
  const categorieOptions = ([...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[]).map(
    (label, id) => ({ id, label })
  );
  const hasFilters = Boolean(articleFilter || categorieFilter);

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Categorie", key: "categorie" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stockActuel" },
    { label: "Deja en commande/import", key: "dejaEnCommande" },
    { label: `Objectif (${MOIS_LONG[moisIdx]}, 9 mois)`, key: "objectif" },
    { label: "Stock min (3 mois)", key: "minStock" },
    { label: "A commander", key: "aCommander" },
  ];

  const exportRows = propositionRows.map((row) => ({
    article: row.nom_article,
    categorie: row.categorie || "-",
    unite: row.unite || "-",
    stockActuel: row.stock_actuel,
    dejaEnCommande: row.deja_en_commande,
    objectif: row.objectif,
    minStock: row.min_stock === null ? "-" : row.min_stock,
    aCommander: row.a_commander,
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
              Proposition de Commande MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Choisis le mois de la commande : pour chaque article, l&apos;objectif (besoin reel
              des 9 mois a partir de ce mois - 3 mois de delai de livraison + 6 mois de cycle de
              commande, meme calcul que Besoin Commande MP) est compare au
              stock actuel et a ce qui est deja en commande/import (pas encore receptionne). Seuls
              les articles ou stock + deja-commande ne suffisent pas apparaissent, avec la quantite
              a commander proposee (objectif moins stock actuel moins deja en commande/import).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`proposition-commande-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <select
              name="mois"
              defaultValue={String(moisIdx + 1)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              {MOIS_LONG.map((nom, idx) => (
                <option key={nom} value={idx + 1}>
                  Commander en {nom}
                </option>
              ))}
            </select>
            <SearchableFilterInput
              name="article"
              defaultValue={articleFilter}
              options={articleOptions}
              placeholder="Article..."
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
                  href={`/stock/matiere-premiere/rapport/proposition?mois=${moisIdx + 1}`}
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
          ) : propositionRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters
                ? "Aucun resultat pour ce filtre."
                : `Aucun article a commander pour ${MOIS_LONG[moisIdx]} : le stock actuel couvre deja l'objectif partout.`}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Deja en commande/import</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Objectif ({MOIS_LONG[moisIdx]}, 9 mois)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock min (3 mois)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">A commander</th>
                  </tr>
                </thead>
                <tbody>
                  {propositionRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.deja_en_commande)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.objectif)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.min_stock === null ? "-" : formatNumber(row.min_stock)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          {formatNumber(row.a_commander)}
                        </span>
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
