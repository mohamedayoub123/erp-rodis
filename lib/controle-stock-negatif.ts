import { supabaseServer } from "@/lib/supabase-server";

// Controle commun "aucune sortie ne doit rendre le stock negatif" (demande
// explicite : "il faut pas accepter une sortie de TI ou n'importe quelle
// sortie qui va faire le stock negatif, en PF comme en MP"). Lecture seule :
// on calcule le solde reel du lot (entrees - sorties, SANS retirer les
// reservations d'autres Transfer Orders / commandes - ce n'est pas un
// controle de disponibilite, juste un garde-fou contre le negatif) et on
// refuse des qu'une sortie le ferait descendre sous zero.
//
// Deux portees :
// - depotId renseigne : solde du lot dans CE depot seulement (un lot dont
//   depot_id est vide compte dans le depot par defaut de son article, meme
//   regle que lib/depot-stock.ts) - utilise par le Transfer Invoice, qui
//   sort du depot source ;
// - depotId absent : solde total du lot, tous depots confondus (meme portee
//   que les RPC de sortie Stock PF / Sortie MP).
//
// Un lot est reconnu par son numero sans tenir compte de la casse ni des
// espaces autour (meme cle que stock_mp_lot_balances / stock_pf_lot_balances) ;
// cote PF, une ligne dont code_normalise correspond compte aussi (certaines
// vieilles lignes n'ont que l'un des deux champs coherent).

export type TypeStock = "MP" | "PF";

export type SortieStock = {
  articleType: TypeStock;
  articleId: number;
  numeroLot: string | null;
  // Quantite qui va quitter le stock de ce lot (> 0).
  quantite: number;
  depotId?: number | null;
};

export type ManqueStock = {
  articleType: TypeStock;
  articleId: number;
  numeroLot: string;
  depotId: number | null;
  disponible: number;
  demande: number;
};

const EPSILON = 1e-6;

function normaliserLot(numeroLot: string | null | undefined) {
  return (numeroLot ?? "").trim().toUpperCase();
}

function formaterQuantite(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 6 });
}

type LigneMouvement = {
  numero_lot: string | null;
  code_normalise?: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  depot_id: number | null;
};

async function lireMouvementsArticle(articleType: TypeStock, articleId: number): Promise<LigneMouvement[]> {
  const table = articleType === "MP" ? "lots_stock_matiere_premiere" : "lots_stock";
  const colonnes = "numero_lot, code_normalise, qte_entree, qte_sortie, depot_id";
  const lignes: LigneMouvement[] = [];
  const taillePage = 1000;

  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(colonnes)
      .eq("article_id", articleId)
      .order("id", { ascending: true })
      .range(debut, debut + taillePage - 1);

    if (error) {
      throw new Error(`Verification du stock impossible : ${error.message}`);
    }

    const page = (data ?? []) as LigneMouvement[];
    lignes.push(...page);
    if (page.length < taillePage) break;
  }

  return lignes;
}

async function lireDepotParDefaut(articleType: TypeStock, articleId: number): Promise<number | null> {
  const table = articleType === "MP" ? "articles_matiere_premiere" : "articles";
  const { data } = await supabaseServer.from(table).select("depot_id").eq("id", articleId).maybeSingle();
  return (data as { depot_id: number | null } | null)?.depot_id ?? null;
}

// Cumule d'abord les sorties par (type, article, lot, depot) - plusieurs
// lignes d'un meme document qui visent le meme lot doivent etre verifiees
// ensemble, jamais une par une.
export async function trouverManquesDeStock(sorties: SortieStock[]): Promise<ManqueStock[]> {
  const demandes = new Map<string, SortieStock & { quantite: number }>();

  for (const sortie of sorties) {
    const quantite = Number(sortie.quantite);
    if (!sortie.articleId || !Number.isFinite(quantite) || quantite <= 1e-9) continue;

    const depotId = sortie.depotId ?? null;
    const cle = `${sortie.articleType}|${sortie.articleId}|${normaliserLot(sortie.numeroLot)}|${depotId ?? "*"}`;
    const existante = demandes.get(cle);
    if (existante) {
      existante.quantite += quantite;
    } else {
      demandes.set(cle, { ...sortie, depotId, quantite });
    }
  }

  if (demandes.size === 0) return [];

  const parArticle = new Map<string, (SortieStock & { quantite: number })[]>();
  for (const demande of demandes.values()) {
    const cle = `${demande.articleType}|${demande.articleId}`;
    parArticle.set(cle, [...(parArticle.get(cle) ?? []), demande]);
  }

  const manques: ManqueStock[] = [];

  await Promise.all(
    [...parArticle.values()].map(async (demandesArticle) => {
      const { articleType, articleId } = demandesArticle[0];
      const avecDepot = demandesArticle.some((d) => d.depotId !== null);
      const [mouvements, depotParDefaut] = await Promise.all([
        lireMouvementsArticle(articleType, articleId),
        avecDepot ? lireDepotParDefaut(articleType, articleId) : Promise.resolve<number | null>(null),
      ]);

      for (const demande of demandesArticle) {
        const lotCherche = normaliserLot(demande.numeroLot);
        let disponible = 0;

        for (const ligne of mouvements) {
          const memeLot =
            normaliserLot(ligne.numero_lot) === lotCherche ||
            (articleType === "PF" && normaliserLot(ligne.code_normalise) === lotCherche && lotCherche !== "");
          if (!memeLot) continue;

          if (demande.depotId !== null) {
            const depotEffectif = ligne.depot_id ?? depotParDefaut;
            if (depotEffectif !== demande.depotId) continue;
          }

          disponible += Number(ligne.qte_entree ?? 0) - Number(ligne.qte_sortie ?? 0);
        }

        if (disponible - demande.quantite < -EPSILON) {
          manques.push({
            articleType,
            articleId,
            numeroLot: (demande.numeroLot ?? "").trim(),
            depotId: demande.depotId ?? null,
            disponible,
            demande: demande.quantite,
          });
        }
      }
    })
  );

  return manques;
}

async function lireNoms(table: string, colonne: string, ids: number[]): Promise<Map<number, string>> {
  const noms = new Map<number, string>();
  if (ids.length === 0) return noms;

  const { data } = await supabaseServer.from(table).select(`id, ${colonne}`).in("id", ids);
  for (const ligne of (data ?? []) as unknown as Record<string, unknown>[]) {
    noms.set(Number(ligne.id), String(ligne[colonne] ?? ""));
  }
  return noms;
}

export async function formaterMessageStockNegatif(manques: ManqueStock[]): Promise<string> {
  const idsPf = [...new Set(manques.filter((m) => m.articleType === "PF").map((m) => m.articleId))];
  const idsMp = [...new Set(manques.filter((m) => m.articleType === "MP").map((m) => m.articleId))];
  const idsDepots = [...new Set(manques.map((m) => m.depotId).filter((id): id is number => id !== null))];

  const [nomsPf, nomsMp, nomsDepots] = await Promise.all([
    lireNoms("articles", "nom_article", idsPf),
    lireNoms("articles_matiere_premiere", "nom_article", idsMp),
    lireNoms("depots", "nom", idsDepots),
  ]);

  const details = manques.slice(0, 5).map((manque) => {
    const nomArticle =
      (manque.articleType === "MP" ? nomsMp : nomsPf).get(manque.articleId) || `#${manque.articleId}`;
    const lot = manque.numeroLot ? `"${manque.numeroLot}"` : "(sans numero de lot)";
    const type = manque.articleType === "MP" ? "matiere premiere" : "produit fini";
    const depot =
      manque.depotId !== null ? ` dans le depot ${nomsDepots.get(manque.depotId) || `#${manque.depotId}`}` : "";
    return `lot ${lot} de l'article ${nomArticle} (${type})${depot} : disponible ${formaterQuantite(manque.disponible)}, sortie demandee ${formaterQuantite(manque.demande)}`;
  });

  if (manques.length === 1) {
    return `Impossible : le stock deviendrait negatif - ${details[0]}.`;
  }

  const reste = manques.length - details.length;
  return `Impossible : le stock deviendrait negatif pour ${manques.length} lots - ${details.join(" ; ")}${reste > 0 ? ` ; et ${reste} autre(s) lot(s)` : ""}.`;
}

// Message pret a afficher, ou null si toutes les sorties passent.
export async function trouverMessageStockNegatif(sorties: SortieStock[]): Promise<string | null> {
  const manques = await trouverManquesDeStock(sorties);
  if (manques.length === 0) return null;
  return formaterMessageStockNegatif(manques);
}

// Version "throw" pour les actions qui affichent deja leurs erreurs
// (redirection avec message) - a appeler AVANT la premiere ecriture, pour
// ne jamais laisser un document a moitie enregistre.
export async function verifierSortiesSansStockNegatif(sorties: SortieStock[]): Promise<void> {
  const message = await trouverMessageStockNegatif(sorties);
  if (message) {
    throw new Error(message);
  }
}
