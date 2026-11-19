import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportAlerteButton } from "@/app/_components/export-alerte-button";
import { COULEURS_EXCEL, type DonneesAlerte } from "@/lib/stock-alert-excel-donnees";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { MultiSelectFilter } from "@/app/_components/multi-select-filter";
import { construireQuery, correspondALaListe, lireListeParam, optionsDistinctes } from "@/lib/filtre-multiple";
import { formatDate } from "@/lib/format-date";
import { encodeDossierId } from "../commande/dossier-id";
import { matchesArticleSearch } from "@/lib/article-search";
import { computeStatutBc } from "../bc/constants";
import { fetchAgregatsMpParArticle } from "@/lib/mp-agregats";
import { lireStockMpDepotE, type StockMpDepotRow } from "@/lib/lot-balances-mp";
import { lireTransferOrdersEnCoursDepot, type TransferOrderEnCours, type TransferOrdersArticle } from "@/lib/transfer-orders-en-cours";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
  min_stock: number | null;
  max_stock: number | null;
  utilisation: string | null;
};

type AlerteRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  sous_famille: string | null;
  unite: string | null;
  // Stock du Depot E MOINS ce que les Transfer Orders (TO) partis du Depot E vont encore en sortir
  stock_actuel: number;
  stock_depot_e: number;
  to_deduits: number;
  tos: TransferOrderEnCours[];
  // Couleur de la ligne (voir couleurAlerte) : null = la ligne ne s'allume pas
  couleur: CouleurAlerte | null;
  min_stock: number;
  consommation_1_mois: number;
  consommation_3_mois: number;
  consommation_6_mois: number;
  consommation_12_mois: number;
  entree_12_mois: number;
  entree_3_mois: number;
  utilisation_produit: string | null;
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
  statut: string | null;
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
      .select("id, nom_article, categorie, sous_famille, unite, min_stock, max_stock, utilisation")
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
      .select("id, article_id, code, n_doss_4d, n_doss_erp, quantite, statut")
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
      .select("bc_ligne_id, n_doss_4d_import, n_doss_erp_import, quantite_importee, lot_stock_id")
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

// La ligne d'un article s'allume quand son stock (Depot E moins TO) est egal ou inferieur a sa consommation des 3 derniers mois :
//  - JAUNE  : une commande (BC) et PAS d'import ;
//  - VERT   : un import est en cours ;
//  - ORANGE : ni commande (BC) ni import.
// Sinon (stock au-dessus de la consommation des 3 mois) la ligne reste blanche.
type CouleurAlerte = "jaune" | "vert" | "orange";

// fondExcel / texteExcel : les memes couleurs (yellow-200, green-200, orange-200) dans le fichier Excel
const COULEURS_ALERTE: Record<
  CouleurAlerte,
  { ligne: string; puce: string; libelle: string; export: string; fondExcel: string; texteExcel: string }
> = {
  jaune: {
    ligne: "bg-yellow-200",
    puce: "bg-yellow-200 text-yellow-900",
    libelle: "Commande (BC) sans import",
    export: "Jaune - BC sans import",
    fondExcel: COULEURS_EXCEL.jauneLigne,
    texteExcel: COULEURS_EXCEL.jauneTexte,
  },
  vert: {
    ligne: "bg-green-200",
    puce: "bg-green-200 text-green-900",
    libelle: "Import en cours",
    export: "Vert - import en cours",
    fondExcel: COULEURS_EXCEL.vertLigne,
    texteExcel: COULEURS_EXCEL.vertTexte,
  },
  orange: {
    ligne: "bg-orange-200",
    puce: "bg-orange-200 text-orange-900",
    libelle: "Ni commande (BC) ni import",
    export: "Orange - ni BC ni import",
    fondExcel: COULEURS_EXCEL.orangeLigne,
    texteExcel: COULEURS_EXCEL.orangeTexte,
  },
};

function couleurAlerte(stock: number, consommation3Mois: number, aUnBc: boolean, aUnImport: boolean): CouleurAlerte | null {
  if (!(stock <= consommation3Mois)) return null;
  if (aUnImport) return "vert";
  return aUnBc ? "jaune" : "orange";
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// categorie / sous_famille : plusieurs valeurs possibles (?categorie=A&categorie=B) - voir MultiSelectFilter.
type SearchParams = Promise<{
  q?: string;
  categorie?: string | string[];
  sous_famille?: string | string[];
  hide_low_threshold?: string;
  tout?: string;
}>;

// Plus de 1100 articles en alerte rendaient ~4 Mo de HTML a chaque ouverture :
// le tableau montre les premiers de la liste triee, "Voir tout" affiche le
// reste (le filtre et l'export Excel portent toujours sur tout).
const LIMITE_LIGNES = 150;

export default async function StockAlerteMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categoriesChoisies = lireListeParam(params.categorie);
  const sousFamillesChoisies = lireListeParam(params.sous_famille);
  const qLower = q.toLowerCase();
  const hideLowThreshold = (params.hide_low_threshold || "").trim() === "1";

  const [
    { rows: articles, error: articlesError },
    { rows: agregats, error: mouvementsError },
    { rows: bcLignes, error: bcError },
    { rows: importEvenements, error: importError },
    { rows: dossierStatuts, error: statutError },
    { rows: stockDepotE, error: depotEError },
    { parArticle: transferOrders, error: transferOrdersError },
  ] = await Promise.all([
    fetchAllArticlesMp(),
    fetchAgregatsMpParArticle(),
    fetchAllBcLignes(),
    fetchAllImportEvenements(),
    fetchAllDossierStatuts(),
    // lireStockMpDepotE leve une erreur de lecture : on l'affiche comme les autres, jamais un stock a 0 qui ferait croire a une alerte
    lireStockMpDepotE().then(
      (rows) => ({ rows, error: null }),
      (e: unknown) => ({
        rows: [] as StockMpDepotRow[],
        error: { message: `Stock Depot E : ${e instanceof Error ? e.message : String(e)}` },
      })
    ),
    // Ce que les TO partis du Depot E vont encore en sortir : une erreur est affichee (jamais un stock sans la deduction des TO, qui ferait
    // croire qu'il en reste plus qu'en realite)
    lireTransferOrdersEnCoursDepot("Depot E").then(
      (parArticle) => ({ parArticle, error: null }),
      (e: unknown) => ({
        parArticle: new Map<number, TransferOrdersArticle>(),
        error: { message: `Transfer Orders du Depot E : ${e instanceof Error ? e.message : String(e)}` },
      })
    ),
  ]);

  const error = articlesError || mouvementsError || bcError || importError || statutError || depotEError || transferOrdersError;

  const datePrevueByDossier = new Map(
    dossierStatuts.map((row) => [dossierKey(row.n_doss_4d, row.n_doss_erp), row.date_prevue_reception])
  );

  // Stock actuel = stock du Depot E SEULEMENT (decision de l'utilisateur :
  // le stock des autres depots - Depot B, Depot F... - ne compte pas, comme
  // dans "Stock Alert MP par commande"), MOINS ce que les Transfer Orders
  // (TO) partis du Depot E vont encore en sortir (TO approuves : quantite
  // restante reservee ; TO en attente : quantite demandee - comme la
  // Statistique Article Plastique). Un article sans stock au Depot E
  // vaut 0 ; le stock peut etre negatif (sorties saisies en trop). Alerte
  // des que ce stock descend a ou sous le seuil "Stock min" de l'article.
  // Un article SANS AUCUNE consommation sur 12 mois n'a pas de mouvement :
  // il n'est jamais mis en alerte (demande de l'utilisateur).
  //
  // Consommation (sortie) sur plusieurs fenetres glissantes (1/3/6/12 mois)
  // + Entree sur 12/3 mois - date_jour, meme convention "AAAA-MM-JJ" que le
  // reste de l'appli. Donne un apercu de la vitesse de consommation/
  // reapprovisionnement d'un article en alerte, sans avoir a rouvrir Stock MP.
  // Ces sommes sont calculees directement par la base (une ligne par article,
  // voir lib/mp-agregats.ts) au lieu de telecharger tous les mouvements.
  const stockByArticle = new Map<number, number>();
  const consommationByPeriodAndArticle: Record<1 | 3 | 6 | 12, Map<number, number>> = {
    1: new Map(),
    3: new Map(),
    6: new Map(),
    12: new Map(),
  };
  const entree12MoisByArticle = new Map<number, number>();
  const entree3MoisByArticle = new Map<number, number>();

  for (const solde of stockDepotE) stockByArticle.set(solde.article_id, solde.stock);

  for (const row of agregats) {
    consommationByPeriodAndArticle[1].set(row.article_id, Number(row.sortie_1_mois ?? 0));
    consommationByPeriodAndArticle[3].set(row.article_id, Number(row.sortie_3_mois ?? 0));
    consommationByPeriodAndArticle[6].set(row.article_id, Number(row.sortie_6_mois ?? 0));
    consommationByPeriodAndArticle[12].set(row.article_id, Number(row.sortie_12_mois ?? 0));
    entree12MoisByArticle.set(row.article_id, Number(row.entree_12_mois ?? 0));
    entree3MoisByArticle.set(row.article_id, Number(row.entree_3_mois ?? 0));
  }

  // "Qte importee TOTALE" (tous evenements confondus, receptionnes ou pas)
  // sert uniquement a calculer le statut (voir computeStatutBc) - a ne pas
  // confondre avec importRefsByArticle plus bas, filtre sur lot_stock_id
  // null pour l'affichage "en cours d'import pas encore receptionne". Sans
  // ce total non filtre, un BC entierement receptionne retomberait a "Qte
  // importee=0" (plus aucun evenement "encore ouvert" a sommer) et resterait
  // affiche comme si sa quantite etait encore a commander - meme correctif
  // que sur statistique/page.tsx et bc/page.tsx.
  const quantiteImporteeTotaleByLigneId = new Map<number, number>();
  for (const evenement of importEvenements) {
    quantiteImporteeTotaleByLigneId.set(
      evenement.bc_ligne_id,
      (quantiteImporteeTotaleByLigneId.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
    );
  }

  // Pour chaque article, retrouve les BC (avec leur doss.) qui le
  // concernent, et via leurs lignes les evenements d'import (avec leur
  // propre doss., qui peut differer du doss. de la BC) - pour voir tout de
  // suite si un article en alerte est deja commande/en cours d'import. Un BC
  // deja Termine (entierement receptionne/transfere en stock) est exclu :
  // sinon sa quantite commandee restait affichee ici pour toujours, meme
  // apres avoir ete entierement receptionnee (bug reel signale).
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
      // Reste a recevoir, pas la quantite commandee brute (voir Statistique
      // MP, meme correctif).
      quantite: Math.max(0, quantite - quantiteImportee),
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
    .map((article) => {
      const stockDepotEReel = stockByArticle.get(article.id) ?? 0;
      const to = transferOrders.get(article.id);
      const toDeduits = Math.round(((to?.reserve ?? 0) + (to?.enAttente ?? 0)) * 1e6) / 1e6 || 0;
      const stockApresTo = Math.round((stockDepotEReel - toDeduits) * 1e6) / 1e6 || 0;
      const consommation3Mois = consommationByPeriodAndArticle[3].get(article.id) ?? 0;
      const bcRefs = bcRefsByArticle.get(article.id) ?? [];
      const importRefs = [...(importRefsByArticle.get(article.id)?.values() ?? [])];
      return {
        article_id: article.id,
        nom_article: article.nom_article,
        categorie: article.categorie,
        sous_famille: article.sous_famille,
        unite: article.unite,
        stock_actuel: stockApresTo,
        stock_depot_e: stockDepotEReel,
        to_deduits: toDeduits,
        tos: to?.tos ?? [],
        couleur: couleurAlerte(stockApresTo, consommation3Mois, bcRefs.length > 0, importRefs.length > 0),
        min_stock: article.min_stock as number,
        consommation_1_mois: consommationByPeriodAndArticle[1].get(article.id) ?? 0,
        consommation_3_mois: consommation3Mois,
        consommation_6_mois: consommationByPeriodAndArticle[6].get(article.id) ?? 0,
        consommation_12_mois: consommationByPeriodAndArticle[12].get(article.id) ?? 0,
        entree_12_mois: entree12MoisByArticle.get(article.id) ?? 0,
        entree_3_mois: entree3MoisByArticle.get(article.id) ?? 0,
        utilisation_produit: article.utilisation,
        bcRefs,
        importRefs,
      };
    })
    .filter((row) => row.stock_actuel <= row.min_stock)
    // aucun mouvement de sortie sur 12 mois : pas d'alerte
    .filter((row) => row.consommation_12_mois > 0)
    .filter((row) => !qLower || matchesArticleSearch(row.nom_article, qLower))
    .filter((row) => correspondALaListe(row.categorie, categoriesChoisies))
    .filter((row) => correspondALaListe(row.sous_famille, sousFamillesChoisies))
    .filter((row) => !hideLowThreshold || row.min_stock > 1)
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const toutAffiche = params.tout === "1";
  const alertesAffichees = toutAffiche ? alertes : alertes.slice(0, LIMITE_LIGNES);
  const hrefVoirTout = `/stock/matiere-premiere/alerte?${construireQuery(
    { q, hide_low_threshold: hideLowThreshold ? "1" : undefined, tout: "1" },
    { categorie: categoriesChoisies, sous_famille: sousFamillesChoisies }
  )}`;

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))].map(
    (label, index) => ({ id: index, label })
  );
  const categorieOptions = optionsDistinctes(articles.map((article) => article.categorie));
  const sousFamilleOptions = optionsDistinctes(articles.map((article) => article.sous_famille));

  // Excel : memes couleurs que l'ecran (ligne jaune / verte / orange, stock en rouge, consommations en bleu, entrees en vert, BC et dossiers
  // d'import en bleu souligne), un BC / un import par ligne de la cellule, texte a la ligne, tout en haut a gauche - voir lib/classeur-stock-alert.ts
  const aujourdhuiExcel = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const filtresExcel = [
    q ? `Article : ${q}` : "",
    categoriesChoisies.length ? `Categorie : ${categoriesChoisies.join(", ")}` : "",
    sousFamillesChoisies.length ? `Sous famille : ${sousFamillesChoisies.join(", ")}` : "",
    hideLowThreshold ? "Stock alert a 1 ou moins cache" : "",
  ]
    .filter(Boolean)
    .join(" - ");
  const gris = { texte: COULEURS_EXCEL.gris };
  const bleu = { texte: COULEURS_EXCEL.bleuConsommation, gras: true };
  const vertEntree = { texte: COULEURS_EXCEL.vert, gras: true };
  const donneesExcel: DonneesAlerte = {
    titre: "Stock Alert MP",
    sousTitre: `${alertes.length} article(s) en alerte (Depot E moins TO, stock egal ou inferieur au stock min) - au ${aujourdhuiExcel}. La ligne s'allume quand le stock est egal ou inferieur a la consommation des 3 derniers mois :`,
    filtres: filtresExcel,
    legende: (Object.keys(COULEURS_ALERTE) as CouleurAlerte[]).map((cle) => ({
      libelle: `${COULEURS_ALERTE[cle].export.split(" - ")[0]} : ${COULEURS_ALERTE[cle].libelle}`,
      fond: COULEURS_ALERTE[cle].fondExcel,
      texte: COULEURS_ALERTE[cle].texteExcel,
    })),
    // Le style est donne PAR COLONNE : la page n'envoie qu'une valeur par cellule (1100 articles ou plus)
    colonnes: [
      { titre: "Categorie", largeur: 18, style: gris },
      { titre: "Sous famille", largeur: 20, style: gris },
      { titre: "Article", largeur: 44, style: { texte: COULEURS_EXCEL.texte, gras: true } },
      // la pastille rouge du stock
      { titre: "Stock Depot E (moins TO)", largeur: 17, style: { fond: COULEURS_EXCEL.rougeFond, texte: COULEURS_EXCEL.rougeFort, gras: true } },
      { titre: "Stock Depot E (avant TO)", largeur: 17, style: gris },
      { titre: "TO deduits", largeur: 12, style: gris },
      { titre: "Unite", largeur: 10, style: gris },
      { titre: "Consommation dernier mois", largeur: 16, style: bleu },
      { titre: "Consommation dernier 3 mois", largeur: 16, style: bleu },
      { titre: "Consommation dernier 6 mois", largeur: 16, style: bleu },
      { titre: "Consommation dernier 12 mois", largeur: 16, style: bleu },
      { titre: "Total entree (12 mois)", largeur: 15, style: vertEntree },
      { titre: "Total entree (3 mois)", largeur: 15, style: vertEntree },
      { titre: "Stock alert", largeur: 12, style: gris },
      { titre: "Commande (BC)", largeur: 54 },
      { titre: "Import", largeur: 62 },
      { titre: "Average consommation 12 mois", largeur: 17, style: gris },
      { titre: "Utilisation produit", largeur: 30, style: gris },
      { titre: "Couleur alerte", largeur: 26, style: { texte: COULEURS_EXCEL.texte } },
    ],
    lignes: alertes.map((alerte) => ({
      fond: alerte.couleur ? COULEURS_ALERTE[alerte.couleur].fondExcel : undefined,
      cellules: [
        alerte.categorie || "-",
        alerte.sous_famille || "-",
        alerte.nom_article,
        alerte.stock_actuel,
        alerte.stock_depot_e,
        alerte.to_deduits,
        alerte.unite || "-",
        alerte.consommation_1_mois,
        alerte.consommation_3_mois,
        alerte.consommation_6_mois,
        alerte.consommation_12_mois,
        alerte.entree_12_mois,
        alerte.entree_3_mois,
        alerte.min_stock,
        {
          details: alerte.bcRefs.map((ref) => ({
            code: ref.code,
            reste: ` - Qte commandee: ${ref.quantite} - 4D: ${ref.nDoss4d || "-"} / ERP: ${ref.nDossErp || "-"}`,
          })),
        },
        {
          details: alerte.importRefs.map((ref) => ({
            code: `4D: ${ref.nDoss4d || "-"} / ERP: ${ref.nDossErp || "-"}`,
            reste: ` - Qte importee: ${ref.qteImportee} - Arrivee prevue: ${ref.datePrevueReception ? formatDate(ref.datePrevueReception) : "-"}`,
          })),
        },
        Math.round((alerte.consommation_12_mois / 12) * 100) / 100,
        alerte.utilisation_produit || "-",
        alerte.couleur ? COULEURS_ALERTE[alerte.couleur].export : "-",
      ],
    })),
  };

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
              Articles dont le stock du Depot E (seulement, les autres depots ne comptent pas), moins ce que les
              Transfer Orders (TO) vont encore en sortir, est egal ou inferieur au stock min defini sur l&apos;article.
              Un article sans aucune consommation sur les 12 derniers mois n&apos;est pas affiche.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportAlerteButton donnees={donneesExcel} nomFichier={`stock-alert-mp-${new Date().toISOString().slice(0, 10)}.xlsx`} />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-5">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={articleOptions}
              placeholder="Rechercher un article..."
            />
            <MultiSelectFilter
              name="categorie"
              placeholder="Categorie..."
              options={categorieOptions}
              selected={categoriesChoisies}
            />
            <MultiSelectFilter
              name="sous_famille"
              placeholder="Sous famille..."
              options={sousFamilleOptions}
              selected={sousFamillesChoisies}
            />
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="hide_low_threshold"
                value="1"
                defaultChecked={hideLowThreshold}
                className="h-4 w-4"
              />
              Cacher Stock alert a 1 ou moins
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-3 text-xs">
            <span className="font-semibold text-slate-600">
              La ligne s&apos;allume quand le stock (Depot E moins TO) est egal ou inferieur a la consommation des 3 derniers mois :
            </span>
            {(Object.keys(COULEURS_ALERTE) as CouleurAlerte[]).map((cle) => (
              <span key={cle} className={`rounded-full px-3 py-1 font-semibold ${COULEURS_ALERTE[cle].puce}`}>
                {COULEURS_ALERTE[cle].libelle}
              </span>
            ))}
          </div>
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
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Sous famille</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                      Stock Depot E
                      <span className="block text-xs font-normal text-slate-400">moins les TO</span>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Consommation dernier mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Consommation dernier 3 mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Consommation dernier 6 mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Consommation dernier 12 mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Total entree (12 mois)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Total entree (3 mois)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock alert</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Commande (BC)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Import</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Average consommation 12 mois</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Utilisation produit</th>
                  </tr>
                </thead>
                <tbody>
                  {alertesAffichees.map((alerte) => (
                    <tr
                      key={alerte.article_id}
                      data-couleur={alerte.couleur ?? undefined}
                      title={alerte.couleur ? COULEURS_ALERTE[alerte.couleur].libelle : undefined}
                      className={`border-t border-slate-100 ${alerte.couleur ? COULEURS_ALERTE[alerte.couleur].ligne : ""}`}
                    >
                      <td className="px-6 py-4 text-slate-600">{alerte.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{alerte.sous_famille || "-"}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{alerte.nom_article}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          {formatNumber(alerte.stock_actuel)}
                        </span>
                        {alerte.to_deduits > 0 ? (
                          // Ce qui a ete retire du stock du Depot E : les TO qui en partent et ne l'ont pas encore sorti
                          <details className="mt-1">
                            <summary className="cursor-pointer whitespace-nowrap text-xs font-semibold text-sky-700">
                              Depot E {formatNumber(alerte.stock_depot_e)} - TO {formatNumber(alerte.to_deduits)}
                            </summary>
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                              {alerte.tos.map((to) => (
                                <li key={to.code}>
                                  <Link href={to.href} className="font-semibold text-sky-700 hover:underline">
                                    {to.code}
                                  </Link>{" "}
                                  : {formatNumber(to.quantite)} <span className="text-slate-500">{to.detail}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{alerte.unite || "-"}</td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.consommation_1_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.consommation_3_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.consommation_6_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(alerte.consommation_12_mois)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-emerald-700">
                        {formatNumber(alerte.entree_12_mois)}
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
                        {formatNumber(alerte.consommation_12_mois / 12)} / mois
                      </td>
                      <td className="px-6 py-4 text-slate-600">{alerte.utilisation_produit || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <VoirToutBanner affiches={alertesAffichees.length} total={alertes.length} href={hrefVoirTout} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
