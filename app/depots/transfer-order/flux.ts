import { supabaseServer } from "@/lib/supabase-server";
import { fetchPlCodeByGroupeId } from "@/lib/programme-numbering";
import type { ArticleType } from "./stock-lots";

export type FluxOrigine =
  | { type: "programme_mb"; label: string; href: string }
  | { type: "programme_ligne"; label: string; href: string }
  | { type: "manuel"; creePar: string | null; remarque: string | null };

export type FluxConsommateur = { code: string; produit: string | null; href: string };

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

async function fetchNomArticle(articleType: ArticleType, articleId: number): Promise<string> {
  const table = articleType === "MP" ? "articles_matiere_premiere" : "articles";
  const { data } = await supabaseServer.from(table).select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

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
    const plCodeByGroupeId = await fetchPlCodeByGroupeId();
    origine = {
      type: "programme_ligne",
      label: plCodeByGroupeId.get(to.source_groupe_id_programme_ligne) ?? `PL-${to.source_groupe_id_programme_ligne}`,
      href: `/historique-programme/${to.source_groupe_id_programme_ligne}`,
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

  const { data: ligneLotsData } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in(
      "transfer_order_ligne_id",
      lignes.map((l) => l.id)
    );
  const ligneLots = (ligneLotsData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[];

  const destinations: FluxDestinationLigne[] = [];

  for (const ligne of lignes) {
    if (ligne.article_type !== "MP") continue;
    const lots = ligneLots.filter((l) => l.transfer_order_ligne_id === ligne.id);
    if (lots.length === 0) continue;

    const nomArticle = await fetchNomArticle(ligne.article_type, ligne.article_id);

    for (const lot of lots) {
      let reserveQuery = supabaseServer
        .from("production_mp_reserve")
        .select("id, production_code_termine_id")
        .eq("article_mp_id", ligne.article_id)
        .eq("depot_id", to.depot_destination_id);
      reserveQuery = lot.numero_lot === null ? reserveQuery.is("numero_lot", null) : reserveQuery.eq("numero_lot", lot.numero_lot);
      const { data: reserveData } = await reserveQuery;
      const reserves = (reserveData ?? []) as { id: number; production_code_termine_id: number }[];

      let consommateurs: FluxConsommateur[] = [];
      if (reserves.length > 0) {
        const { data: termineData } = await supabaseServer
          .from("production_code_termine")
          .select("id, programme_ligne_id, code")
          .in(
            "id",
            reserves.map((r) => r.production_code_termine_id)
          );
        const termineRows = (termineData ?? []) as { id: number; programme_ligne_id: number; code: string }[];

        const plIds = [...new Set(termineRows.map((t) => t.programme_ligne_id))];
        const { data: plData } = await supabaseServer
          .from("programme_lignes")
          .select("id, groupe_id, produit")
          .in("id", plIds.length > 0 ? plIds : [0]);
        const plById = new Map(
          ((plData ?? []) as { id: number; groupe_id: number | null; produit: string | null }[]).map((p) => [p.id, p])
        );

        const seenCodes = new Set<string>();
        for (const t of termineRows) {
          if (seenCodes.has(t.code)) continue;
          seenCodes.add(t.code);
          const pl = plById.get(t.programme_ligne_id);
          consommateurs.push({
            code: t.code,
            produit: pl?.produit ?? null,
            href: pl?.groupe_id ? `/historique-programme/${pl.groupe_id}` : `/production/suivi/dashboard`,
          });
        }
      }

      destinations.push({
        articleNom: nomArticle,
        numeroLot: lot.numero_lot,
        quantite: lot.quantite,
        consommateurs,
      });
    }
  }

  return { origine, tis, destinations };
}
