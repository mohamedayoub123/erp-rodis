import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { fetchAgregatsMpParArticle } from "@/lib/mp-agregats";
import { comparerCategorieEtSousFamille } from "@/lib/ordre-categories-mp";
import {
  DELAI_LIVRAISON_MOIS,
  SECURITE_MOIS,
  anneeConsommationMois,
  moisLivraison,
  moisObjectif,
  objectifMois,
} from "@/lib/delai-commande-mp";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
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
  sous_famille: string | null;
  unite: string | null;
  stock_actuel: number;
  deja_en_commande: number;
  // stock actuel + BC / import ; sortie de l'article le mois de la livraison l'annee passee (ex : avril 2026) ; sortie des 2 mois de plus
  // (mai + juin 2026) ; objectif = les 3 additionnes (avec le detail mois par mois pour l'info-bulle)
  stock_et_commande: number;
  sortie_livraison: number;
  sortie_securite: number;
  objectif: number;
  detail_objectif: string;
  // objectif - (stock actuel + BC / import), jamais negatif : la regle seule, aucun mois d'avant n'est ajoute
  a_commander: number;
};

const MOIS_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

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

async function fetchAllBcLignes() {
  const rows: BcLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, article_id, quantite")
      .order("id", { ascending: true })
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
      .order("id", { ascending: true })
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

  const moisCourant = new Date().getMonth();
  const moisParam = Number(params.mois);
  const moisIdx =
    Number.isInteger(moisParam) && moisParam >= 1 && moisParam <= 12
      ? moisParam - 1
      : moisCourant;
  // Une commande passee en <mois choisi> arrive 4 mois plus tard : commander en decembre 2026 = livraison en avril 2027, commander en
  // septembre 2026 = livraison en janvier 2027. Le mois choisi est toujours celui de l'annee en cours (meme s'il est deja passe).
  const anneeActuelle = new Date().getFullYear();
  const anneeCommande = anneeActuelle;
  const moisLiv = moisLivraison(moisIdx);
  const anneeLivraison = anneeCommande + (moisIdx + DELAI_LIVRAISON_MOIS >= 12 ? 1 : 0);
  const livraisonAvecAnnee = `${MOIS_LONG[moisLiv]} ${anneeLivraison}`;
  // Les sorties prises : le mois de livraison puis les 2 mois de plus, chacun le meme mois de l'annee passee (donnees des 12 derniers mois)
  const [moisSortieLivraison, ...moisSortieSecurite] = moisObjectif(moisIdx);
  const sortieLivraisonLibelle = `${MOIS_LONG[moisSortieLivraison]} ${anneeConsommationMois(moisSortieLivraison)}`;
  const securiteLibelle = moisSortieSecurite.map((mois) => `${MOIS_LONG[mois]} ${anneeConsommationMois(mois)}`).join(" + ");

  const [
    { rows: articles, error: articlesError },
    { rows: agregats, error: mouvementsError },
    { rows: bcLignes, error: bcError },
    { rows: importEvenements, error: importError },
  ] = await Promise.all([
    fetchAllArticlesMp(),
    fetchAgregatsMpParArticle(),
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
  // Une commande passee le mois choisi arrive 4 mois plus tard. Objectif =
  // la sortie du mois de livraison l'annee passee (ex : avril 2026 pour une
  // commande de decembre) + 2 mois de plus (mai + juin 2026), meme formule
  // que Besoin Commande MP - voir lib/delai-commande-mp.ts.
  // A commander = objectif moins (stock actuel + ce qui est deja en
  // commande BC / import) (jamais negatif - si stock + BC / import couvrent
  // deja l'objectif, rien a commander, l'article n'apparait pas).
  // Stock et consommation par mois calendaire sont calcules directement par
  // la base (une ligne par article, voir lib/mp-agregats.ts) au lieu de
  // telecharger tous les mouvements.
  const stockByArticle = new Map<number, number>();
  const consommationByArticleAndMois = new Map<number, number[]>();

  for (const row of agregats) {
    stockByArticle.set(row.article_id, Number(row.stock ?? 0));
    consommationByArticleAndMois.set(
      row.article_id,
      Array.from({ length: 12 }, (_, idx) => Number(row.sortie_par_mois?.[idx] ?? 0))
    );
  }

  const propositionRows: PropositionRow[] = articles
    .map((article) => {
      const stockActuel = stockByArticle.get(article.id) ?? 0;
      const dejaEnCommande = dejaEnCommandeByArticle.get(article.id) ?? 0;
      const consommationParMoisCalendaire = consommationByArticleAndMois.get(article.id) ?? new Array(12).fill(0);
      const objectif = objectifMois(consommationParMoisCalendaire, moisIdx);
      // A commander = la regle seule : objectif - (stock actuel + BC / import), jamais negatif. Les mois d'avant ne sont pas regardes.
      const aCommander = Math.max(0, Math.round((objectif - (stockActuel + dejaEnCommande)) * 100) / 100);

      const sortieLivraison = consommationParMoisCalendaire[moisSortieLivraison];
      const sortieSecurite = moisSortieSecurite.reduce((somme, mois) => somme + consommationParMoisCalendaire[mois], 0);
      // Detail de l'objectif pour l'info-bulle : la sortie de chaque mois pris en compte, avec l'annee
      const detailObjectif = [moisSortieLivraison, ...moisSortieSecurite]
        .map((mois) => `${MOIS_LONG[mois]} ${anneeConsommationMois(mois)} : ${formatNumber(consommationParMoisCalendaire[mois])}`)
        .join(" + ");

      return {
        article_id: article.id,
        nom_article: article.nom_article,
        categorie: article.categorie,
        sous_famille: article.sous_famille,
        unite: article.unite,
        stock_actuel: stockActuel,
        deja_en_commande: dejaEnCommande,
        stock_et_commande: Math.round((stockActuel + dejaEnCommande) * 100) / 100,
        sortie_livraison: Math.round(sortieLivraison * 100) / 100,
        sortie_securite: Math.round(sortieSecurite * 100) / 100,
        detail_objectif: detailObjectif,
        objectif,
        a_commander: aCommander,
      };
    })
    .filter((row) => row.a_commander > 0)
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    // Meme classement que Stock Alert MP : la categorie (BASE, MP cosmetique, colorant cosmetique... puis les autres par nom), la
    // sous-famille (par nom), puis le nom de l'article - voir lib/ordre-categories-mp.ts. L'Excel suit le meme ordre.
    .sort(
      (a, b) =>
        comparerCategorieEtSousFamille(a, b) || a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" })
    );

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map((label, id) => ({
    id,
    label,
  }));
  const categorieOptions = ([...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[]).map(
    (label, id) => ({ id, label })
  );
  const hasFilters = Boolean(articleFilter || categorieFilter);

  const exportColumns = [
    { label: "Famille (categorie)", key: "categorie" },
    { label: "Sous famille", key: "sousFamille" },
    { label: "Article", key: "article" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stockActuel" },
    { label: "BC / import (pas encore recu)", key: "dejaEnCommande" },
    { label: "Stock + BC / import", key: "stockEtCommande" },
    { label: `Sortie ${sortieLivraisonLibelle} (livraison ${livraisonAvecAnnee})`, key: "sortieLivraison" },
    { label: `+ ${SECURITE_MOIS} mois de plus (${securiteLibelle})`, key: "sortieSecurite" },
    { label: "Objectif (livraison + 2 mois)", key: "objectif" },
    { label: "A commander", key: "aCommander" },
  ];

  const exportRows = propositionRows.map((row) => ({
    categorie: row.categorie || "-",
    sousFamille: row.sous_famille || "-",
    article: row.nom_article,
    unite: row.unite || "-",
    stockActuel: row.stock_actuel,
    dejaEnCommande: row.deja_en_commande,
    stockEtCommande: row.stock_et_commande,
    sortieLivraison: row.sortie_livraison,
    sortieSecurite: row.sortie_securite,
    objectif: row.objectif,
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
              Choisis le mois de la commande : elle arrive {DELAI_LIVRAISON_MOIS} mois plus tard (commander en {MOIS_LONG[moisIdx]} = livraison
              en {livraisonAvecAnnee}). L&apos;objectif = la sortie de l&apos;article le mois de la livraison l&apos;annee passee
              ({sortieLivraisonLibelle}) + {SECURITE_MOIS} mois de plus ({securiteLibelle}). On part du stock actuel, on y
              ajoute ce qui est deja en commande (BC) ou en import et pas encore recu, et on retire cette somme de
              l&apos;objectif (meme calcul que Besoin Commande MP). Seuls les articles ou stock + BC / import ne suffisent
              pas apparaissent, avec la quantite a commander. Classement comme Stock Alert MP :
              famille (BASE, MP cosmetique, colorant cosmetique, article de conditionnement cosmetique, flacons verre, MP
              plastique, colorant plastique, puis les autres), puis sous famille, puis article.
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
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Famille (categorie)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Sous famille</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      BC / import
                      <span className="block text-xs font-normal text-slate-400">pas encore recu</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock + BC / import</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      Sortie {sortieLivraisonLibelle}
                      <span className="block text-xs font-normal text-slate-400">livraison {livraisonAvecAnnee}</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      + {SECURITE_MOIS} mois de plus
                      <span className="block text-xs font-normal text-slate-400">{securiteLibelle}</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      Objectif
                      <span className="block text-xs font-normal text-slate-400">livraison + {SECURITE_MOIS} mois</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      A commander
                      <span className="block text-xs font-normal text-slate-400">objectif - (stock + BC / import)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {propositionRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.sous_famille || "-"}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{row.deja_en_commande > 0 ? formatNumber(row.deja_en_commande) : "-"}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{formatNumber(row.stock_et_commande)}</td>
                      <td className="px-6 py-4 font-semibold text-sky-700">{formatNumber(row.sortie_livraison)}</td>
                      <td className="px-6 py-4 font-semibold text-sky-700">{formatNumber(row.sortie_securite)}</td>
                      <td title={`${row.detail_objectif} = ${formatNumber(row.objectif)}`} className="px-6 py-4 text-slate-600">
                        {formatNumber(row.objectif)}
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
