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
  updateTypeMachinePlastiqueAction,
  updateNbCavitesAction,
  modifierCavitesMachinePlastiqueAction,
  retirerMachinePlastiqueAction,
  saveCommandeArticlePlastiqueAction,
} from "@/app/_components/statistique-article-plastique-actions";
import {
  SQL_TYPE_MACHINE_PLASTIQUE,
  TYPES_MACHINE_PLASTIQUE,
  libelleTypeMachine,
  repartirParTypeMachine,
} from "@/lib/type-machine-plastique";
import {
  SQL_ARTICLE_MACHINES_PLASTIQUE,
  SQL_EQUIPEMENTS_PLASTIQUE,
  fetchEquipementsPlastique,
  fetchMachinesParArticle,
  type MachineArticle,
} from "@/lib/equipements-plastique";
import { lireStockMpDepotE } from "@/lib/lot-balances-mp";
import { lireTransferOrdersEnCoursDepot, type TransferOrderEnCours, type TransferOrdersArticle } from "@/lib/transfer-orders-en-cours";
import {
  lireLivraisonsDepotFVersDepotE,
  lireQuantiteCommande,
  resteAFabriquer,
  type LivraisonArticle,
  type TiLivre,
} from "@/lib/livraisons-depot-f-vers-e";
import { separerUtilisations } from "@/lib/utilisation-article";
import { FormulaireAjoutMachinePlastique } from "@/app/_components/formulaire-ajout-machine-plastique";

// Statistique Article Plastique (E3) : page production-plastique/statistique. La copie qui existait dans Rapport MP
// (stock/matiere-premiere/rapport/plastique) a ete retiree (demande explicite : c'etait la meme page).

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
  utilisation: string | null;
  // Colonnes ajoutees par scripts/sql/add_machine_cavites_articles_matiere_premiere.sql
  machine_plastique?: string | null;
  nb_cavites?: number | null;
  // Colonne ajoutee par scripts/sql/add_type_machine_plastique.sql
  type_machine_plastique?: string | null;
};

export type PlastiqueRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  // Type du ou des produits finis dont la recette de conditionnement contient cet article
  // (ex: "Gel douche", "Clarifiant") ; vide si l'article n'est dans aucune recette.
  types_produit: string[];
  // Champ "Utilisation" de l'article (Articles Matiere Premiere) : les produits auxquels il sert, UN PAR ELEMENT (ils sont
  // souvent saisis sur plusieurs lignes ou colles les uns aux autres, voir separerUtilisations)
  utilisations: string[];
  unite: string | null;
  gamme: string | null;
  // Stock du Depot E MOINS ce que les Transfer Orders (TO) partis du Depot E vont encore en sortir : c'est ce chiffre qui
  // sert aux couleurs, a "Demarrer la production ?", a l'export et a la commande enregistree (Save)
  stock_actuel: number;
  // Stock reel du Depot E avant de deduire les TO, la quantite deduite (TO approuves : quantite restante reservee ; TO en
  // attente : quantite demandee) et les TO concernes
  stock_depot_e: number;
  to_deduits: number;
  tos: TransferOrderEnCours[];
  min_stock: number | null;
  max_stock: number | null;
  avis_fabrication: string | null;
  // Saisis a la main : machine sur laquelle l'article travaille (vide = aucune) et cavites du moule
  machine: string | null;
  nb_cavites: number | null;
  // Procede de fabrication choisi a la main : INJECTION, SOUFFLAGE ou PET (null = non renseigne)
  type_machine: string | null;
  // RESTE a fabriquer : la quantite de cet article dans la derniere commande enregistree (Save) MOINS ce qui est deja arrive au
  // Depot E depuis (Transfer Invoice valides du Depot F au Depot E) ; null = pas dans cette commande
  a_fabriquer: string | null;
  // Quantite de la commande telle qu'enregistree, ce qui est deja livre du Depot F au Depot E depuis, et les TI concernes
  commande_qt: string | null;
  livre_a_e: number;
  tis: TiLivre[];
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

const COLONNES_DETAIL = "id, sous_famille, min_stock, max_stock, gamme, avis_fabrication, utilisation";

// Lit les details des articles plastique avec Machine/Cavites et Type de machine ; tant qu'un script SQL
// n'a pas ete lance (colonnes absentes), relit sans ces colonnes pour que la page reste utilisable.
async function lireDetailsPlastique(): Promise<{
  data: ArticleDetailRow[] | null;
  error: string | null;
  machineCavitesPret: boolean;
  typeMachinePret: boolean;
}> {
  const avecTypeMachine = await supabaseServer
    .from("articles_matiere_premiere")
    .select(`${COLONNES_DETAIL}, machine_plastique, nb_cavites, type_machine_plastique`)
    .eq("categorie", CATEGORIE_PLASTIQUE);
  if (!avecTypeMachine.error) {
    return {
      data: avecTypeMachine.data as unknown as ArticleDetailRow[],
      error: null,
      machineCavitesPret: true,
      typeMachinePret: true,
    };
  }

  const complet = await supabaseServer
    .from("articles_matiere_premiere")
    .select(`${COLONNES_DETAIL}, machine_plastique, nb_cavites`)
    .eq("categorie", CATEGORIE_PLASTIQUE);
  if (!complet.error) {
    return {
      data: complet.data as unknown as ArticleDetailRow[],
      error: null,
      machineCavitesPret: true,
      typeMachinePret: false,
    };
  }

  const simple = await supabaseServer
    .from("articles_matiere_premiere")
    .select(COLONNES_DETAIL)
    .eq("categorie", CATEGORIE_PLASTIQUE);
  return {
    data: simple.error ? null : (simple.data as unknown as ArticleDetailRow[]),
    error: simple.error?.message ?? null,
    machineCavitesPret: false,
    typeMachinePret: false,
  };
}

// "A fabriquer" = ce qui a ete commande : les quantites de la DERNIERE commande enregistree
// (bouton Save). Un nouveau Save remplace tout ; avant la premiere commande, la colonne est vide.
// Ce qui est deja arrive au Depot E depuis cette commande (Transfer Invoice valides du Depot F au Depot E) est lu en meme temps :
// la commande BAISSE a chaque livraison (demande explicite). Une erreur de lecture des livraisons est remontee (jamais un reste
// a fabriquer qui ignore ce qui est deja livre).
async function lireDerniereCommande(): Promise<{
  code: string | null;
  parArticle: Map<number, string>;
  livraisons: Map<number, LivraisonArticle>;
  erreurLivraisons: string | null;
}> {
  const parArticle = new Map<number, string>();
  const livraisons = new Map<number, LivraisonArticle>();

  const { data: commande, error } = await supabaseServer
    .from("commandes_article_plastique")
    .select("id, code, created_at")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !commande) return { code: null, parArticle, livraisons, erreurLivraisons: null };

  const { data: lignes, error: lignesError } = await supabaseServer
    .from("commandes_article_plastique_lignes")
    .select("article_id, qt_avis")
    .eq("commande_id", (commande as { id: number }).id);
  if (lignesError) return { code: (commande as { code: string }).code, parArticle, livraisons, erreurLivraisons: null };

  for (const ligne of (lignes ?? []) as { article_id: number; qt_avis: string | null }[]) {
    const quantite = (ligne.qt_avis ?? "").trim();
    if (quantite) parArticle.set(ligne.article_id, quantite);
  }

  let erreurLivraisons: string | null = null;
  try {
    const lues = await lireLivraisonsDepotFVersDepotE({
      articleIds: [...parArticle.keys()],
      depuis: (commande as { created_at: string }).created_at,
    });
    for (const [articleId, livraison] of lues) livraisons.set(articleId, livraison);
  } catch (e) {
    erreurLivraisons = `Livraisons du Depot F au Depot E illisibles : ${e instanceof Error ? e.message : "erreur inconnue"}`;
  }
  return { code: (commande as { code: string }).code, parArticle, livraisons, erreurLivraisons };
}

// La quantite est un texte libre (avis) : un nombre est mis en forme, le reste s'affiche tel quel.
function formaterAFabriquer(valeur: string | null): string {
  if (!valeur) return "-";
  const nombre = lireQuantiteCommande(valeur);
  return nombre !== null ? formatNumber(nombre) : valeur;
}

// Reste-t-il encore quelque chose a fabriquer ? Faux quand l'article n'est pas dans la commande ou que tout est deja livre (0) ;
// une quantite qui n'est pas un nombre (texte libre) compte comme "a fabriquer".
function resteEncoreAFabriquer(valeur: string | null): boolean {
  if (!valeur) return false;
  const nombre = lireQuantiteCommande(valeur);
  return nombre === null || nombre > 0;
}

export async function fetchPlastiqueRows(): Promise<{
  rows: PlastiqueRow[];
  error: string | null;
  machineCavitesPret: boolean;
  typeMachinePret: boolean;
  derniereCommandeCode: string | null;
}> {
  // Stock = celui du Depot E SEULEMENT (demande explicite) : stock_actuel_mp_rows additionne TOUS les depots, il ne sert ici
  // qu'a lister les articles ; le stock affiche vient de lireStockMpDepotE (meme stock que Besoin Conditionnement), MOINS ce
  // que les Transfer Orders partis du Depot E vont encore en sortir (demande explicite : un TO d'articles plastique se deduit
  // du stock de l'E3 sans attendre que le Transfer Invoice soit valide)
  const [stockResult, detailResult, derniereCommande, stockDepotE, transferOrders] = await Promise.all([
    fetchAllStockActuelMpRows(),
    lireDetailsPlastique(),
    lireDerniereCommande(),
    lireStockMpDepotE().then(
      (lignes) => ({ parArticle: new Map(lignes.map((ligne) => [ligne.article_id, ligne.stock])), erreur: null as string | null }),
      (e: unknown) => ({
        parArticle: new Map<number, number>(),
        erreur: `Stock du Depot E illisible : ${e instanceof Error ? e.message : "erreur inconnue"}`,
      })
    ),
    // Une erreur est remontee (jamais un stock sans la deduction des TO, qui ferait croire qu'il en reste plus qu'en realite)
    lireTransferOrdersEnCoursDepot("Depot E").then(
      (parArticle) => ({ parArticle, erreur: null as string | null }),
      (e: unknown) => ({
        parArticle: new Map<number, TransferOrdersArticle>(),
        erreur: `Transfer Orders du Depot E illisibles : ${e instanceof Error ? e.message : "erreur inconnue"}`,
      })
    ),
  ]);

  if (stockResult.error) {
    return { rows: [], error: stockResult.error, machineCavitesPret: false, typeMachinePret: false, derniereCommandeCode: null };
  }
  if (stockDepotE.erreur) {
    return { rows: [], error: stockDepotE.erreur, machineCavitesPret: false, typeMachinePret: false, derniereCommandeCode: null };
  }
  if (transferOrders.erreur) {
    return { rows: [], error: transferOrders.erreur, machineCavitesPret: false, typeMachinePret: false, derniereCommandeCode: null };
  }
  if (derniereCommande.erreurLivraisons) {
    return { rows: [], error: derniereCommande.erreurLivraisons, machineCavitesPret: false, typeMachinePret: false, derniereCommandeCode: null };
  }
  if (detailResult.error || !detailResult.data) {
    return {
      rows: [],
      error: detailResult.error ?? "Lecture des articles impossible.",
      machineCavitesPret: false,
      typeMachinePret: false,
      derniereCommandeCode: null,
    };
  }

  const detailById = new Map(detailResult.data.map((row) => [row.id, row]));
  const typesParArticle = await fetchTypesParArticlePlastique(
    stockResult.rows.filter((row) => row.categorie === CATEGORIE_PLASTIQUE).map((row) => row.article_id)
  );

  const rows = stockResult.rows
    .filter((row) => row.categorie === CATEGORIE_PLASTIQUE)
    .map((row) => {
      const detail = detailById.get(row.article_id);
      const stockReel = stockDepotE.parArticle.get(row.article_id) ?? 0;
      const to = transferOrders.parArticle.get(row.article_id);
      const toDeduits = (to?.reserve ?? 0) + (to?.enAttente ?? 0);
      const commandeQt = derniereCommande.parArticle.get(row.article_id) ?? null;
      const livraison = derniereCommande.livraisons.get(row.article_id);
      return {
        article_id: row.article_id,
        nom_article: row.nom_article,
        // Sous famille lue sur l'article (la fonction SQL ne la renvoie pas toujours)
        categorie: detail?.sous_famille ?? row.sous_famille ?? null,
        types_produit: typesParArticle.get(row.article_id) ?? [],
        utilisations: separerUtilisations(detail?.utilisation),
        unite: row.unite,
        gamme: detail?.gamme ?? null,
        stock_actuel: Math.round((stockReel - toDeduits) * 1e6) / 1e6 || 0,
        stock_depot_e: stockReel,
        to_deduits: Math.round(toDeduits * 1e6) / 1e6 || 0,
        tos: to?.tos ?? [],
        min_stock: detail?.min_stock ?? null,
        max_stock: detail?.max_stock ?? null,
        avis_fabrication: detail?.avis_fabrication ?? null,
        machine: detail?.machine_plastique ?? null,
        nb_cavites: detail?.nb_cavites ?? null,
        type_machine: detail?.type_machine_plastique ?? null,
        a_fabriquer: resteAFabriquer(commandeQt, livraison?.livre ?? 0),
        commande_qt: commandeQt,
        livre_a_e: livraison?.livre ?? 0,
        tis: livraison?.tis ?? [],
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

  return {
    rows,
    error: null,
    machineCavitesPret: detailResult.machineCavitesPret,
    typeMachinePret: detailResult.typeMachinePret,
    derniereCommandeCode: derniereCommande.code,
  };
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

// Machines d'un article : une LIGNE PAR MACHINE avec SES cavites (un article peut en avoir 3 ou plus qui travaillent en meme
// temps), et en dessous une ligne pour en ajouter une de plus (nom pris dans la liste Equipements + ses cavites).
function CelluleMachines({
  articleId,
  machines,
  nbCavitesAvant,
  canEdit,
}: {
  articleId: number;
  machines: MachineArticle[];
  // nombre de cavites saisi AVANT l'arrivee des machines multiples (un seul nombre par article) : gardé visible tant que
  // l'article n'a aucune machine
  nbCavitesAvant: number | null;
  canEdit: boolean;
}) {
  if (!canEdit) {
    if (machines.length === 0) return <span className="text-slate-600">-</span>;
    return (
      <ul className="space-y-1">
        {machines.map((machine) => (
          <li key={machine.equipementId} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
            <span className="font-semibold">{machine.nom}</span> - {machine.nbCavites ?? "?"} cavite(s)
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {machines.length > 0 ? (
        <ul className="space-y-1.5">
          {machines.map((machine) => (
            // key : la ligne se remet a jour apres OK
            <li
              key={`${machine.equipementId}-${machine.nbCavites ?? ""}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1"
            >
              <span className="min-w-[3rem] text-sm font-semibold text-slate-900">{machine.nom}</span>
              <form action={modifierCavitesMachinePlastiqueAction} className="flex items-center gap-1">
                <input type="hidden" name="article_id" value={articleId} />
                <input type="hidden" name="equipement_id" value={machine.equipementId} />
                <input
                  type="number"
                  name="nb_cavites"
                  defaultValue={machine.nbCavites ?? ""}
                  placeholder="Cav."
                  min="1"
                  max="999"
                  step="1"
                  aria-label={`Cavites de ${machine.nom}`}
                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none"
                />
                <SubmitButton
                  pendingLabel="..."
                  className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  OK
                </SubmitButton>
              </form>
              <form action={retirerMachinePlastiqueAction}>
                <input type="hidden" name="article_id" value={articleId} />
                <input type="hidden" name="equipement_id" value={machine.equipementId} />
                <SubmitButton
                  pendingLabel="..."
                  className="rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Retirer
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <FormulaireAjoutMachinePlastique articleId={articleId} aDesMachines={machines.length > 0} />

      {machines.length === 0 && nbCavitesAvant !== null ? (
        <p className="text-xs text-slate-400">Cavites saisies avant : {nbCavitesAvant}</p>
      ) : null}
    </div>
  );
}

export async function StatistiqueArticlePlastique({
  pageHref,
  canEdit,
  searchParams,
}: {
  pageHref: string;
  canEdit: boolean;
  searchParams: Promise<{
  q?: string;
  categorie?: string;
  type?: string;
  gamme?: string;
  machine?: string;
  typemachine?: string;
  afabriquer?: string;
  demarrage?: string;
}>;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categorieFilter = (params.categorie || "").trim();
  const typeFilter = (params.type || "").trim();
  const gammeFilter = (params.gamme || "").trim();
  // Filtres a 3 choix (tous / avec / sans) : toute autre valeur de l'adresse est ignoree
  const machineFilter = params.machine === "avec" || params.machine === "sans" ? params.machine : "";
  // Type de machine : un des 3 types, ou "sans" (pas encore renseigne - pratique pour remplir les articles restants)
  const typeMachineFilter =
    params.typemachine === "sans" || TYPES_MACHINE_PLASTIQUE.some((type) => type.code === params.typemachine)
      ? (params.typemachine ?? "")
      : "";
  const aFabriquerFilter = params.afabriquer === "avec" || params.afabriquer === "sans" ? params.afabriquer : "";
  const demarrageFilter =
    params.demarrage === "demarrer" || params.demarrage === "ne_pas_demarrer" ? params.demarrage : "";
  const hasFilters = Boolean(
    q ||
      categorieFilter ||
      typeFilter ||
      gammeFilter ||
      machineFilter ||
      typeMachineFilter ||
      aFabriquerFilter ||
      demarrageFilter
  );

  const [{ rows: allRows, error, machineCavitesPret, typeMachinePret, derniereCommandeCode }, equipementsPlastique] =
    await Promise.all([fetchPlastiqueRows(), fetchEquipementsPlastique()]);
  // Machine en cours : liste des equipements de la Production Plastique (page Equipements) ; tant que cette liste n'existe
  // pas (SQL pas lance), la machine reste une saisie libre
  const nomsEquipements = equipementsPlastique.equipements.map((equipement) => equipement.nom);
  // Plusieurs machines par article, chacune avec ses cavites (table article_machines_plastique) ; tant qu'elle n'existe pas
  // (SQL pas lance), une seule machine et un seul nombre de cavites par article comme avant
  const machinesResult = equipementsPlastique.pret
    ? await fetchMachinesParArticle(equipementsPlastique.equipements)
    : { pret: false, parArticle: new Map<number, MachineArticle[]>() };
  const machinesPret = machinesResult.pret;
  const machinesDe = (articleId: number): MachineArticle[] => machinesResult.parArticle.get(articleId) ?? [];

  const rows = allRows
    .filter((row) => !q || matchesArticleSearch(row.nom_article, q))
    .filter((row) => !categorieFilter || displayCategorie(row.categorie) === categorieFilter)
    // Type : un article utilise par plusieurs types (ex. "Clarifiant, Hydratant") ressort pour chacun
    .filter(
      (row) =>
        !typeFilter || row.types_produit.some((type) => type.toLowerCase() === typeFilter.toLowerCase())
    )
    .filter((row) => !gammeFilter || (row.gamme || "").toLowerCase() === gammeFilter.toLowerCase())
    // Machine : "avec" = au moins une machine est renseignee
    .filter(
      (row) =>
        !machineFilter ||
        (machinesPret ? machinesDe(row.article_id).length > 0 : Boolean(row.machine?.trim())) === (machineFilter === "avec")
    )
    // Type de machine : un des 3 types, ou "sans" = pas encore choisi
    .filter(
      (row) =>
        !typeMachineFilter || (typeMachineFilter === "sans" ? !row.type_machine : row.type_machine === typeMachineFilter)
    )
    // A fabriquer : "avec" = l'article est dans la derniere commande ET il en reste a fabriquer (tout livre = "sans")
    .filter((row) => !aFabriquerFilter || resteEncoreAFabriquer(row.a_fabriquer) === (aFabriquerFilter === "avec"))
    // Production : "Demarrer" ou "Ne pas demarrer" (les articles sans stock max n'ont ni l'un ni l'autre)
    .filter((row) => {
      if (!demarrageFilter) return true;
      const arret = doitArreterProduction(row);
      return arret !== null && arret === (demarrageFilter === "ne_pas_demarrer");
    });

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
    { label: "Machine en cours", key: "machine" },
    { label: "Cavites", key: "cavites" },
    { label: "Gamme", key: "gamme" },
    { label: "Sous famille", key: "categorie" },
    { label: "Type", key: "type" },
    { label: "Utilisation", key: "utilisation" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel (Depot E moins TO)", key: "stock" },
    { label: "Stock Depot E (avant TO)", key: "stockDepotE" },
    { label: "TO deduits", key: "toDeduits" },
    { label: "Stock min", key: "min" },
    { label: "Stock critique", key: "critique" },
    { label: "Stock max", key: "max" },
    { label: "Stock max - 20 %", key: "seuilArret" },
    { label: "Demarrer la production ?", key: "arret" },
    { label: "A fabriquer (reste)", key: "aFabriquer" },
    { label: "Commande enregistree", key: "commandeQt" },
    { label: "Livre Depot F vers E", key: "livreDepotE" },
    { label: "Avis de fabrication", key: "avis" },
    { label: "Type de machine", key: "typeMachine" },
  ];
  const versLigneExport = (row: PlastiqueRow) => ({
    article: row.nom_article,
    gamme: row.gamme || "-",
    categorie: displayCategorie(row.categorie),
    type: row.types_produit.length > 0 ? row.types_produit.join(", ") : "-",
    // une utilisation par ligne dans la cellule Excel (retour a la ligne, texte a la ligne dans le classeur)
    utilisation: row.utilisations.length > 0 ? row.utilisations.join("\n") : "-",
    unite: row.unite || "-",
    stock: row.stock_actuel,
    stockDepotE: row.stock_depot_e,
    toDeduits: row.to_deduits,
    min: row.min_stock ?? "-",
    critique: computeStockCritique(row) ?? "-",
    max: row.max_stock ?? "-",
    seuilArret: computeSeuilArret(row) ?? "-",
    arret: (() => {
      const arret = doitArreterProduction(row);
      return arret === null ? "-" : arret ? "Ne pas demarrer" : "Demarrer";
    })(),
    aFabriquer: formaterAFabriquer(row.a_fabriquer),
    commandeQt: formaterAFabriquer(row.commande_qt),
    livreDepotE: row.commande_qt !== null ? row.livre_a_e : "-",
    avis: row.avis_fabrication || "-",
    typeMachine: libelleTypeMachine(row.type_machine),
    // Plusieurs machines : une par ligne dans la cellule Excel, et ses cavites sur la MEME ligne de la colonne Cavites
    machine: machinesPret
      ? machinesDe(row.article_id).length > 0
        ? machinesDe(row.article_id)
            .map((machine) => machine.nom)
            .join("\n")
        : "-"
      : row.machine || "-",
    cavites: machinesPret
      ? machinesDe(row.article_id).length > 0
        ? machinesDe(row.article_id)
            .map((machine) => machine.nbCavites ?? "-")
            .join("\n")
        : "-"
      : (row.nb_cavites ?? "-"),
  });
  const exportRows = rows.map(versLigneExport);
  // Excel en 3 feuilles : Injection, Soufflage, PET (d'apres la colonne Type de machine) ; les articles sans type, s'il y en a,
  // sont dans une 4e feuille "Sans type"
  const exportFeuilles = repartirParTypeMachine(rows).map((feuille) => ({
    name: feuille.nom,
    rows: feuille.rows.map(versLigneExport),
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
          <select
            name="machine"
            defaultValue={machineFilter}
            aria-label="Filtre machine"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">Machine : tous les articles</option>
            <option value="avec">Avec machine</option>
            <option value="sans">Sans machine</option>
          </select>
          <select
            name="typemachine"
            defaultValue={typeMachineFilter}
            aria-label="Filtre type de machine"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">Type de machine : tous</option>
            {TYPES_MACHINE_PLASTIQUE.map((type) => (
              <option key={type.code} value={type.code}>
                {type.libelle}
              </option>
            ))}
            <option value="sans">Type de machine non renseigne</option>
          </select>
          <select
            name="afabriquer"
            defaultValue={aFabriquerFilter}
            aria-label="Filtre a fabriquer"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">A fabriquer : tous les articles</option>
            <option value="avec">Avec a fabriquer</option>
            <option value="sans">Sans a fabriquer</option>
          </select>
          <select
            name="demarrage"
            defaultValue={demarrageFilter}
            aria-label="Filtre demarrer la production"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">Production : tous les articles</option>
            <option value="demarrer">Demarrer</option>
            <option value="ne_pas_demarrer">Ne pas demarrer</option>
          </select>
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
                sheets={exportFeuilles}
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
      {!error && machineCavitesPret && !equipementsPlastique.pret ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          La liste des equipements n&apos;est pas encore active : lance d&apos;abord le script SQL{" "}
          {SQL_EQUIPEMENTS_PLASTIQUE.replace("scripts/sql/", "")} dans Supabase (SQL Editor). En attendant, la machine se
          tape a la main.
        </p>
      ) : null}
      {!error && equipementsPlastique.pret && !machinesPret ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Plusieurs machines par article (chacune avec ses cavites) ne sont pas encore actives : lance d&apos;abord le script SQL{" "}
          {SQL_ARTICLE_MACHINES_PLASTIQUE.replace("scripts/sql/", "")} dans Supabase (SQL Editor). En attendant, un article n&apos;a
          qu&apos;une machine et un nombre de cavites.
        </p>
      ) : null}
      {!error && machineCavitesPret && !typeMachinePret ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Type de machine n&apos;est pas encore actif : lance d&apos;abord le script SQL{" "}
          {SQL_TYPE_MACHINE_PLASTIQUE.replace("scripts/sql/", "")} dans Supabase (SQL Editor).
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
                  {machinesPret ? (
                    <th className="px-6 py-4 font-semibold">
                      Machines en cours et cavites
                      <span className="block text-xs font-normal text-slate-400">1 ligne par machine, avec ses cavites</span>
                    </th>
                  ) : (
                    <>
                      <th className="px-6 py-4 font-semibold">Machine en cours</th>
                      <th className="px-6 py-4 font-semibold">Cavites</th>
                    </>
                  )}
                  <th className="px-6 py-4 font-semibold">Gamme</th>
                  <th className="px-6 py-4 font-semibold">Sous famille</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Utilisation</th>
                  <th className="px-6 py-4 font-semibold">Unite</th>
                  <th className="px-6 py-4 font-semibold">
                    Stock actuel
                    <span className="block text-xs font-normal text-slate-400">Depot E moins les TO</span>
                  </th>
                  <th className="px-6 py-4 font-semibold">Stock min</th>
                  <th className="px-6 py-4 font-semibold">Stock critique</th>
                  <th className="px-6 py-4 font-semibold">Stock max</th>
                  <th className="px-6 py-4 font-semibold">Stock max - 20 %</th>
                  <th className="px-6 py-4 font-semibold">Demarrer la production ?</th>
                  <th className="px-6 py-4 font-semibold">
                    A fabriquer
                    {derniereCommandeCode ? (
                      <span className="block text-xs font-normal text-slate-400">
                        commande {derniereCommandeCode} moins livre F vers E
                      </span>
                    ) : null}
                  </th>
                  <th className="px-6 py-4 font-semibold">Avis de fabrication</th>
                  <th className="px-6 py-4 font-semibold">Type de machine</th>
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
                  const critique = computeStockCritique(row);
                  const seuilArret = computeSeuilArret(row);
                  const arret = doitArreterProduction(row);
                  return (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      {machinesPret ? (
                        <td className="min-w-[22rem] px-6 py-4 align-top">
                          <CelluleMachines
                            articleId={row.article_id}
                            machines={machinesDe(row.article_id)}
                            nbCavitesAvant={row.nb_cavites}
                            canEdit={canEdit}
                          />
                        </td>
                      ) : (
                        <>
                      <td className="px-6 py-4">
                        {canEdit && machineCavitesPret ? (
                          <div className="flex items-center gap-2">
                            {/* key : le champ se remet a jour apres Enregistrer / Supprimer */}
                            <form
                              key={`machine-${row.machine ?? ""}`}
                              action={updateMachinePlastiqueAction}
                              className="flex items-center gap-2"
                            >
                              <input type="hidden" name="article_id" value={row.article_id} />
                              {equipementsPlastique.pret ? (
                                <select
                                  name="machine"
                                  defaultValue={row.machine ?? ""}
                                  aria-label="Machine en cours (equipements de la production plastique)"
                                  className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none"
                                >
                                  <option value="">Machine...</option>
                                  {nomsEquipements.map((nom) => (
                                    <option key={nom} value={nom}>
                                      {nom}
                                    </option>
                                  ))}
                                  {/* Machine saisie avant la liste et absente de celle-ci : on la garde visible */}
                                  {row.machine && !nomsEquipements.includes(row.machine) ? (
                                    <option value={row.machine}>{row.machine} (hors liste)</option>
                                  ) : null}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  name="machine"
                                  defaultValue={row.machine ?? ""}
                                  placeholder="Machine..."
                                  maxLength={100}
                                  className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                                />
                              )}
                              <SubmitButton
                                pendingLabel="..."
                                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                              >
                                OK
                              </SubmitButton>
                            </form>
                            {row.machine ? (
                              // Machine vide = plus aucune machine ne travaille sur cet article
                              <form action={updateMachinePlastiqueAction}>
                                <input type="hidden" name="article_id" value={row.article_id} />
                                <input type="hidden" name="machine" value="" />
                                <SubmitButton
                                  pendingLabel="..."
                                  className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                  Supprimer
                                </SubmitButton>
                              </form>
                            ) : null}
                          </div>
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
                        </>
                      )}
                      <td className="px-6 py-4 text-slate-600">{row.gamme || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{displayCategorie(row.categorie)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.types_produit.length > 0 ? row.types_produit.join(", ") : "-"}
                      </td>
                      {/* Une utilisation par ligne, chacune dans son cadre (jamais collees les unes aux autres) */}
                      <td className="min-w-[14rem] max-w-xs px-6 py-4 text-slate-600">
                        {row.utilisations.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {row.utilisations.map((utilisation, index) => (
                              <li
                                key={`${index}-${utilisation}`}
                                className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                              >
                                {utilisation}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                          {formatNumber(row.stock_actuel)}
                        </span>
                        {row.to_deduits > 0 ? (
                          // Ce qui a ete retire du stock du Depot E : les Transfer Orders qui en partent et ne l'ont pas encore sorti
                          <details className="mt-1">
                            <summary className="cursor-pointer whitespace-nowrap text-xs font-semibold text-sky-700">
                              Depot E {formatNumber(row.stock_depot_e)} - TO {formatNumber(row.to_deduits)}
                            </summary>
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                              {row.tos.map((to) => (
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
                      <td className="px-6 py-4">
                        {/* Tout livre (reste a 0) : en vert, la commande de cet article est terminee */}
                        <span
                          className={`font-bold ${
                            row.a_fabriquer !== null && !resteEncoreAFabriquer(row.a_fabriquer) ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {formaterAFabriquer(row.a_fabriquer)}
                        </span>
                        {row.commande_qt !== null && lireQuantiteCommande(row.commande_qt) !== null && row.livre_a_e > 0 ? (
                          // La commande moins ce qui est deja arrive au Depot E : les Transfer Invoice valides du Depot F au Depot E
                          <details className="mt-1">
                            <summary className="cursor-pointer whitespace-nowrap text-xs font-semibold text-sky-700">
                              Commande {formaterAFabriquer(row.commande_qt)} - livre {formatNumber(row.livre_a_e)}
                            </summary>
                            <ul className="mt-1 space-y-1 text-xs font-normal text-slate-700">
                              {row.tis.map((ti) => (
                                <li key={ti.code}>
                                  <Link href={ti.href} className="font-semibold text-sky-700 hover:underline">
                                    {ti.code}
                                  </Link>{" "}
                                  : {formatNumber(ti.quantite)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
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
                        {canEdit && typeMachinePret && !row.type_machine ? (
                          // Le type est FIXE : on ne le choisit qu'une fois (liste montree seulement tant qu'il est vide) ;
                          // key : la cellule se remet a jour apres OK
                          <form
                            key={`type-machine-${row.type_machine ?? ""}`}
                            action={updateTypeMachinePlastiqueAction}
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <select
                              name="type_machine"
                              defaultValue={row.type_machine ?? ""}
                              aria-label="Type de machine : injection, soufflage ou PET"
                              className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none"
                            >
                              <option value="">Type...</option>
                              {TYPES_MACHINE_PLASTIQUE.map((type) => (
                                <option key={type.code} value={type.code}>
                                  {type.libelle}
                                </option>
                              ))}
                            </select>
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              OK
                            </SubmitButton>
                          </form>
                        ) : row.type_machine ? (
                          <span
                            title="Type de machine fixe : il ne peut plus etre change"
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                          >
                            {libelleTypeMachine(row.type_machine)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {machinesPret && canEdit ? (
              // Les machines proposees quand on tape (une seule liste pour toutes les lignes)
              <datalist id="equipements-e3">
                {nomsEquipements.map((nom) => (
                  <option key={nom} value={nom} />
                ))}
              </datalist>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
