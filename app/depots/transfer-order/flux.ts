import { supabaseServer } from "@/lib/supabase-server";
import { lireParPaquets } from "../[id]/reservations";
import { fetchPlCodeByGroupeId, fetchPdRefsBySourceGroupeId } from "@/lib/programme-numbering";
import type { ArticleType } from "./stock-lots";
import { buildMouvementInfoByRowId, fetchWebMouvementSourceRows, traceProduitFiniPourCode } from "@/app/mouvements/shared";

export type FluxPdRef = { label: string; href: string };

export type FluxOrigine =
  | { type: "programme_mb"; label: string; href: string }
  | { type: "programme_ligne"; label: string; href: string; pds: FluxPdRef[] }
  | { type: "manuel"; creePar: string | null; remarque: string | null };

export type FluxSortie = {
  label: string;
  href: string;
  quantite: number;
  proforma: string | null;
  livrePour: string | null;
};

export type FluxConsommateur = {
  code: string;
  produit: string | null;
  href: string;
  entreeProduction: { entree: true; label: string; href: string } | { entree: false };
  sorties: FluxSortie[];
};

export type FluxDestinationLigne = {
  articleNom: string;
  numeroLot: string | null;
  quantite: number;
  consommateurs: FluxConsommateur[];
};

export type FluxTi = { label: string; href: string; statut: string };

export type FluxInfo = {
  origine: FluxOrigine;
  tis: FluxTi[];
  destinations: FluxDestinationLigne[];
};

// Noms de plusieurs matieres premieres en UNE lecture. Comme avant, une erreur de lecture n'interrompt pas la
// page : l'article s'affiche alors sous la forme "#id".
async function fetchNomsArticlesMp(articleIds: number[]): Promise<Map<number, string>> {
  const noms = new Map<number, string>();
  try {
    const lignes = await lireParPaquets<{ id: number; nom_article: string }>(articleIds, (paquet) =>
      supabaseServer.from("articles_matiere_premiere").select("id, nom_article").in("id", paquet)
    );
    for (const ligne of lignes) noms.set(ligne.id, ligne.nom_article);
  } catch {
    // noms laisses vides -> "#id"
  }
  return noms;
}

type ReserveProduction = {
  id: number;
  production_code_termine_id: number;
  article_mp_id: number;
  numero_lot: string | null;
};

// Reservations de production de ces matieres premieres dans le depot de destination (par pages de 1000, ordre
// stable). "lots" limite la lecture aux numeros de lot concernes (null = pas de limite, quand un lot est vide).
// Comme avant, une erreur de lecture n'interrompt pas la page (on garde ce qui a deja ete lu).
async function lireReservesProduction(
  articleIds: number[],
  lots: string[] | null,
  depotId: number
): Promise<ReserveProduction[]> {
  const reserves: ReserveProduction[] = [];
  for (let i = 0; i < articleIds.length; i += 100) {
    const paquetArticles = articleIds.slice(i, i + 100);
    for (let debut = 0; ; debut += 1000) {
      let requete = supabaseServer
        .from("production_mp_reserve")
        .select("id, production_code_termine_id, article_mp_id, numero_lot")
        .in("article_mp_id", paquetArticles)
        .eq("depot_id", depotId);
      if (lots) requete = requete.in("numero_lot", lots);
      const { data, error } = await requete.order("id", { ascending: true }).range(debut, debut + 999);
      if (error) return reserves;
      const page = (data ?? []) as ReserveProduction[];
      reserves.push(...page);
      if (page.length < 1000) break;
    }
  }
  return reserves;
}

const SANS_LOT = "\u0000sans-lot";
const cleReserve = (articleId: number, numeroLot: string | null) => `${articleId}::${numeroLot === null ? SANS_LOT : numeroLot}`;

// D'ou vient ce Transfer Order (programme qui l'a genere automatiquement
// via "Creer les Transfer Order" sur Verifier Stock, ou saisi a la main -
// demande explicite : "je veux savoir d'ou il vient, si c'est un programme,
// si c'est a la main"), et vers quoi part le stock qu'il livre une fois au
// depot destination (deja repris par une production en cours, ou encore
// disponible) - rapproche via production_mp_reserve (article_mp_id/
// numero_lot/depot_id) -> production_code_termine -> programme_lignes,
// jamais un lien direct stocke nulle part (aucune table ne relie
// directement un mouvement de stock a la production qui l'a consomme).
// Uniquement pour les lignes MP - une ligne PF (produit fini) livre a un
// depot de vente n'a pas cette meme notion de "consommee par un programme"
// (elle part en commande, pas en production).
export async function fetchFluxInfo(transferOrderId: number): Promise<FluxInfo | null> {
  const { data: toData } = await supabaseServer
    .from("transfer_orders")
    .select("id, depot_destination_id, source_numero_programme, source_groupe_id_programme_ligne, cree_par, remarque, date_jour")
    .eq("id", transferOrderId)
    .maybeSingle();

  if (!toData) return null;
  const to = toData as {
    id: number;
    depot_destination_id: number;
    source_numero_programme: number | null;
    source_groupe_id_programme_ligne: number | null;
    cree_par: string | null;
    remarque: string | null;
    date_jour: string;
  };

  let origine: FluxOrigine;
  if (to.source_numero_programme) {
    origine = {
      type: "programme_mb",
      label: `Programme MB.${to.date_jour.slice(0, 4)}.${to.source_numero_programme}`,
      href: `/production/programme/${to.source_numero_programme}`,
    };
  } else if (to.source_groupe_id_programme_ligne) {
    const [plCodeByGroupeId, pdRefsBySourceGroupeId] = await Promise.all([
      fetchPlCodeByGroupeId(),
      fetchPdRefsBySourceGroupeId(),
    ]);
    origine = {
      type: "programme_ligne",
      label: plCodeByGroupeId.get(to.source_groupe_id_programme_ligne) ?? `PL-${to.source_groupe_id_programme_ligne}`,
      href: `/historique-programme/${to.source_groupe_id_programme_ligne}`,
      pds: (pdRefsBySourceGroupeId.get(to.source_groupe_id_programme_ligne) ?? []).map((ref) => ({
        label: ref.code,
        href: `/historique-programme-dispatcher/${ref.groupeId}`,
      })),
    };
  } else {
    origine = { type: "manuel", creePar: to.cree_par, remarque: to.remarque };
  }

  const { data: invoiceOrdersData } = await supabaseServer
    .from("invoice_orders")
    .select("id, statut, date_jour, numero")
    .eq("transfer_order_id", transferOrderId)
    .order("created_at", { ascending: true });
  const tis: FluxTi[] = ((invoiceOrdersData ?? []) as { id: number; statut: string; date_jour: string; numero: number | null }[]).map(
    (io) => ({
      label: `TI.${io.date_jour.slice(0, 4)}.${io.numero ?? io.id}`,
      href: `/depots/invoice-order/${io.id}`,
      statut: io.statut === "valide" ? "Approuve" : "En attente",
    })
  );

  const { data: lignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .eq("transfer_order_id", transferOrderId);
  const lignes = (lignesData ?? []) as { id: number; article_type: ArticleType; article_id: number }[];

  // Ce qui est REELLEMENT livre = les lignes du/des Transfer Invoice VALIDES
  // (invoice_order_lignes, numero_lot/quantite exacts au moment ou le stock a
  // vraiment bouge - voir validateInvoiceOrder) - jamais transfer_order_ligne_lots
  // seul, qui reste souvent VIDE meme sur un Transfer Order deja "poste" (la
  // repartition par lot peut avoir ete faite directement a l'ecran Transfer
  // Invoice, sans jamais passer par le picker de lots du Transfer Order -
  // bug reel confirme : "Destination du stock livre" affichait "Aucun
  // article" alors que 30048 sleeves + 626 cartons avaient bien ete livres).
  // Repli sur transfer_order_ligne_lots (allocation prevue) uniquement s'il
  // n'existe encore AUCUN Transfer Invoice valide pour cette ligne.
  const validatedIoIds = ((invoiceOrdersData ?? []) as { id: number; statut: string }[])
    .filter((io) => io.statut === "valide")
    .map((io) => io.id);
  const { data: invoiceLignesData } = await supabaseServer
    .from("invoice_order_lignes")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in("invoice_order_id", validatedIoIds.length > 0 ? validatedIoIds : [0]);
  const invoiceLignesParLigneId = new Map<number, { numero_lot: string | null; quantite: number }[]>();
  for (const il of (invoiceLignesData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[]) {
    const list = invoiceLignesParLigneId.get(il.transfer_order_ligne_id) ?? [];
    list.push({ numero_lot: il.numero_lot, quantite: il.quantite });
    invoiceLignesParLigneId.set(il.transfer_order_ligne_id, list);
  }

  const lignesSansInvoiceValide = lignes.filter((l) => !invoiceLignesParLigneId.has(l.id));
  const { data: ligneLotsData } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in(
      "transfer_order_ligne_id",
      lignesSansInvoiceValide.length > 0 ? lignesSansInvoiceValide.map((l) => l.id) : [0]
    );
  const ligneLots = (ligneLotsData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[];

  // Regroupe par (article, lot) AVANT de chercher qui l'a repris - demande
  // explicite : "si c'est le meme article et meme lot dans le meme
  // programme, additionne sur une seule ligne". 2 lignes de ce Transfer
  // Order portant sur le meme article+lot (ex: ajoute 2 fois, ou reparti sur
  // plusieurs lignes) donneraient sinon 2 lignes de destination identiques
  // (memes consommateurs, puisque calcules sur le meme article/lot/depot),
  // au lieu d'une seule quantite totale.
  type CleArticleLot = { articleType: ArticleType; articleId: number; numeroLot: string | null };
  const quantiteParCle = new Map<string, { cle: CleArticleLot; quantite: number }>();
  for (const ligne of lignes) {
    if (ligne.article_type !== "MP") continue;
    const lots = invoiceLignesParLigneId.get(ligne.id) ?? ligneLots.filter((l) => l.transfer_order_ligne_id === ligne.id);
    for (const lot of lots) {
      const cleStr = `${ligne.article_id}::${lot.numero_lot ?? ""}`;
      const existing = quantiteParCle.get(cleStr);
      if (existing) {
        existing.quantite += lot.quantite;
      } else {
        quantiteParCle.set(cleStr, {
          cle: { articleType: ligne.article_type, articleId: ligne.article_id, numeroLot: lot.numero_lot },
          quantite: lot.quantite,
        });
      }
    }
  }

  // Trace complete du produit fini issu de chaque code consommateur (entree
  // reelle en stock ET sortie/livraison si deja reparti) - demande explicite
  // : "je veux qu'il me dise l'entree, si c'est TE/TS/Entree Production, et
  // aussi si c'est livre, pour quelle proforma". Le lien qu'on utilisait
  // avant (ecritures_comptables.source_id = "{groupe_id}-{article}" avec
  // groupe_id = programme_lignes.groupe_id) etait FAUX : le vrai groupe_id
  // de l'ecriture "entree_production" est mouvement_groupe_id sur lots_stock
  // (voir recalculerEcritureEntreeProduction), un identifiant totalement
  // different - ce qui faisait toujours passer l'entree pour "pas encore
  // faite" meme quand elle existait. La bonne cle de correspondance est
  // directement (article_id, numero_lot) sur lots_stock : le code tape a
  // l'ecran Entree Production est le meme code de dispatch que
  // production_code_termine (voir commentaire sur numeroLot dans
  // createEntreeProductionBatchAction), et les sorties piochent sur le meme
  // lot. Un seul fetch de tous les mouvements web (TE/TS/Entree Production)
  // pour toute la fonction, jamais un par consommateur.
  const needsTrace = quantiteParCle.size > 0;
  const webRows = needsTrace ? await fetchWebMouvementSourceRows() : [];
  const mouvementInfoByRowId = needsTrace ? await buildMouvementInfoByRowId(webRows) : new Map();

  const cles = [...quantiteParCle.values()];
  const idsArticles = [...new Set(cles.map(({ cle }) => cle.articleId))];
  const unLotVide = cles.some(({ cle }) => cle.numeroLot === null);
  const lotsConcernes = [...new Set(cles.map(({ cle }) => cle.numeroLot).filter((lot): lot is string => lot !== null))];

  // 1. noms + reservations de production de tous les articles, en meme temps
  const [nomsArticles, reservesProduction] =
    cles.length === 0
      ? [new Map<number, string>(), [] as ReserveProduction[]]
      : await Promise.all([
          fetchNomsArticlesMp(idsArticles),
          lireReservesProduction(idsArticles, unLotVide ? null : lotsConcernes, to.depot_destination_id),
        ]);
  const reservesParCle = new Map<string, ReserveProduction[]>();
  for (const reserve of reservesProduction) {
    const cle = cleReserve(reserve.article_mp_id, reserve.numero_lot);
    const liste = reservesParCle.get(cle) ?? [];
    liste.push(reserve);
    reservesParCle.set(cle, liste);
  }

  // 2. leurs codes de production termines, puis 3. leurs lignes de programme (une lecture chacun)
  const idsTermine = [
    ...new Set(
      cles.flatMap(({ cle }) =>
        (reservesParCle.get(cleReserve(cle.articleId, cle.numeroLot)) ?? []).map((reserve) => reserve.production_code_termine_id)
      )
    ),
  ].sort((a, b) => a - b);
  let termineRows: { id: number; programme_ligne_id: number; code: string }[] = [];
  let plRows: { id: number; groupe_id: number | null; produit: string | null; article_id: number | null }[] = [];
  try {
    termineRows = await lireParPaquets(idsTermine, (paquet) =>
      supabaseServer.from("production_code_termine").select("id, programme_ligne_id, code").in("id", paquet).order("id", { ascending: true })
    );
    plRows = await lireParPaquets(
      [...new Set(termineRows.map((termine) => termine.programme_ligne_id))],
      (paquet) => supabaseServer.from("programme_lignes").select("id, groupe_id, produit, article_id").in("id", paquet)
    );
  } catch {
    // comme avant : sans ces lectures, les consommateurs restent simplement vides
  }
  termineRows.sort((a, b) => a.id - b.id);
  const plById = new Map(plRows.map((p) => [p.id, p]));

  const destinations: FluxDestinationLigne[] = cles.map(({ cle, quantite }) => {
    const reserves = reservesParCle.get(cleReserve(cle.articleId, cle.numeroLot)) ?? [];
    const consommateurs: FluxConsommateur[] = [];
    if (reserves.length > 0) {
      const idsDeCetteLigne = new Set(reserves.map((reserve) => reserve.production_code_termine_id));
      const seenCodes = new Set<string>();
      for (const termine of termineRows) {
        if (!idsDeCetteLigne.has(termine.id)) continue;
        if (seenCodes.has(termine.code)) continue;
        seenCodes.add(termine.code);
        const pl = plById.get(termine.programme_ligne_id);
        const { entreeProduction, sorties } = traceProduitFiniPourCode(webRows, mouvementInfoByRowId, pl?.article_id, termine.code);

        consommateurs.push({
          code: termine.code,
          produit: pl?.produit ?? null,
          href: pl?.groupe_id ? `/historique-programme/${pl.groupe_id}` : `/production/suivi/dashboard`,
          entreeProduction,
          sorties,
        });
      }
    }

    return {
      articleNom: nomsArticles.get(cle.articleId) ?? `#${cle.articleId}`,
      numeroLot: cle.numeroLot,
      quantite,
      consommateurs,
    };
  });

  return { origine, tis, destinations };
}
