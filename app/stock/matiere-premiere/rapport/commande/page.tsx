import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
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

type BesoinRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_stock: number | null;
  consommation_12_mois: number;
  consommation_par_mois: number;
  deja_en_commande: number;
  commande_par_mois_depart: number[];
};

const MOIS_COURT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc",
];
const MOIS_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Delai de livraison d'une commande MP : environ 3 mois entre la commande
// et l'arrivee reelle en stock. Le stock a avoir en entrant dans un mois
// doit donc couvrir ce delai (3 mois, le temps que la commande arrive) PLUS
// les 6 mois de fonctionnement normal entre deux commandes - 9 mois de
// consommation au total, pas seulement 6.
const DELAI_LIVRAISON_MOIS = 3;
const CYCLE_COMMANDE_MOIS = 6;

// Consommation glissante sur 9 mois (3 de delai + 6 de cycle) a partir du
// mois de depart (index 0=Janvier..11=Decembre), en bouclant sur l'annee :
// commandeParMoisDepart[i] = conso du mois i + conso des 8 mois suivants
// (avec retour a Janvier apres Decembre).
function commandeGlissanteParMois(consommationParMoisCalendaire: number[]): number[] {
  return consommationParMoisCalendaire.map((_, moisDepart) => {
    let total = 0;
    for (let decalage = 0; decalage < DELAI_LIVRAISON_MOIS + CYCLE_COMMANDE_MOIS; decalage++) {
      total += consommationParMoisCalendaire[(moisDepart + decalage) % 12];
    }
    return Math.round(total * 100) / 100;
  });
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

async function fetchMouvementsSince(sinceDate: string) {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_sortie, date_jour")
      .gte("date_jour", sinceDate)
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

type SearchParams = Promise<{ article?: string; categorie?: string; hide_low_conso?: string }>;

export default async function RapportBesoinCommandeMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hideLowConso = (params.hide_low_conso || "").trim() === "1";
  const hasFilters = Boolean(articleFilter || categorieFilter || hideLowConso);

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
    fetchMouvementsSince(sinceDate),
    fetchAllBcLignes(),
    fetchAllImportEvenements(),
  ]);

  const error = articlesError || mouvementsError || bcError || importError;

  // Quantite deja en commande/import pas encore receptionnee (donc pas
  // encore dans le stock actuel) : par ligne de BC, ce qui reste = quantite
  // commandee - ce qui a deja ete receptionne pour cette ligne (evenements
  // avec lot_stock_id renseigne = vraie reception qui a credite le stock ;
  // lot_stock_id vide = juste declare importe, pas encore receptionne, donc
  // toujours en attente). On soustrait cette quantite deja en attente de
  // l'objectif : pas la peine de proposer une commande pour ce qui arrive
  // deja.
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

  // Consommation moyenne/mois = sortie des 12 derniers mois / 12 (chiffre
  // de reference global). Mais la consommation reelle varie selon le mois
  // calendaire (saisonnalite) : on calcule donc aussi, pour chaque article,
  // la sortie de chaque mois calendaire (Janvier, Fevrier...) sur les 12
  // derniers mois - une seule occurrence de chaque mois dans cette fenetre,
  // donc pas de moyenne a faire. La quantite a avoir en stock en entrant
  // dans un mois donne = somme de la conso de ce mois-la et des 8 suivants
  // (3 mois de delai de livraison + 6 mois de cycle de commande, meme
  // rythme que le fonctionnement reel). Stock min (3 mois, deja sur
  // l'article) reste affiche a cote pour comparaison.
  const consommationByArticle = new Map<number, number>();
  const consommationByArticleAndMois = new Map<number, number[]>();
  for (const row of mouvements) {
    if (!row.article_id || !row.date_jour) continue;
    const qteSortie = Number(row.qte_sortie ?? 0);
    consommationByArticle.set(row.article_id, (consommationByArticle.get(row.article_id) ?? 0) + qteSortie);

    const moisIdx = Number(row.date_jour.slice(5, 7)) - 1;
    if (moisIdx < 0 || moisIdx > 11) continue;
    if (!consommationByArticleAndMois.has(row.article_id)) {
      consommationByArticleAndMois.set(row.article_id, new Array(12).fill(0));
    }
    consommationByArticleAndMois.get(row.article_id)![moisIdx] += qteSortie;
  }

  const besoinRows: BesoinRow[] = articles.map((article) => {
    const consommation12Mois = consommationByArticle.get(article.id) ?? 0;
    const consommationParMois = consommation12Mois / 12;
    const consommationParMoisCalendaire = consommationByArticleAndMois.get(article.id) ?? new Array(12).fill(0);
    const dejaEnCommande = dejaEnCommandeByArticle.get(article.id) ?? 0;
    const commandeBrute = commandeGlissanteParMois(consommationParMoisCalendaire);
    const commandeNette = commandeBrute.map((valeur) => Math.max(0, Math.round((valeur - dejaEnCommande) * 100) / 100));

    return {
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      min_stock: article.min_stock,
      consommation_12_mois: consommation12Mois,
      consommation_par_mois: Math.round(consommationParMois * 100) / 100,
      deja_en_commande: dejaEnCommande,
      commande_par_mois_depart: commandeNette,
    };
  });

  const filteredRows = besoinRows
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .filter((row) => !hideLowConso || row.consommation_par_mois > 1)
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))];
  const categorieOptions = [...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[];

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Categorie", key: "categorie" },
    { label: "Unite", key: "unite" },
    { label: "Conso. moyenne/mois", key: "consommationParMois" },
    { label: "Stock min (3 mois)", key: "minStock" },
    { label: "Deja en commande/import", key: "dejaEnCommande" },
    ...MOIS_LONG.map((mois, idx) => ({ label: mois, key: `mois${idx}` })),
  ];

  const exportRows = filteredRows.map((row) => {
    const moisColumns = Object.fromEntries(
      row.commande_par_mois_depart.map((valeur, idx) => [`mois${idx}`, valeur])
    );
    return {
      article: row.nom_article,
      categorie: row.categorie || "-",
      unite: row.unite || "-",
      consommationParMois: row.consommation_par_mois,
      minStock: row.min_stock === null ? "-" : row.min_stock,
      dejaEnCommande: row.deja_en_commande,
      ...moisColumns,
    };
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Besoin Commande MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Pour chaque article : consommation moyenne mensuelle (sortie des 12 derniers mois /
              12), le Stock min actuel (3 mois) pour comparaison, ce qui est deja en commande/import
              et pas encore receptionne, et pour chacun des 12 mois de l&apos;annee, la quantite a
              commander en plus (objectif 9 mois - 3 mois de delai de livraison + 6 mois de cycle de
              commande - moins ce qui est deja en commande/import - la consommation change selon le
              mois, ce n&apos;est pas juste la moyenne x 9).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`besoin-commande-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <input
              type="text"
              name="article"
              list="besoin-commande-mp-articles"
              autoComplete="off"
              defaultValue={articleFilter}
              placeholder="Article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="besoin-commande-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="categorie"
              list="besoin-commande-mp-categories"
              autoComplete="off"
              defaultValue={params.categorie || ""}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="besoin-commande-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="hide_low_conso"
                value="1"
                defaultChecked={hideLowConso}
                className="h-4 w-4"
              />
              Cacher consommation/mois a 1 ou moins
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/rapport/commande"
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
                    <th className="px-6 py-4 font-semibold">Conso. moyenne/mois</th>
                    <th className="px-6 py-4 font-semibold">Stock min (3 mois)</th>
                    <th className="px-6 py-4 font-semibold">Deja en commande/import</th>
                    {MOIS_COURT.map((mois, idx) => (
                      <th
                        key={mois}
                        className="px-4 py-4 text-center font-semibold"
                        title={`A avoir en stock en entrant dans ${MOIS_LONG[idx]} (3 mois de delai + 6 mois de cycle = 9 mois)`}
                      >
                        {mois}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.consommation_par_mois)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.min_stock === null ? "-" : formatNumber(row.min_stock)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.deja_en_commande)}</td>
                      {row.commande_par_mois_depart.map((valeur, idx) => (
                        <td key={idx} className="px-4 py-4 text-center">
                          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">
                            {formatNumber(valeur)}
                          </span>
                        </td>
                      ))}
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
