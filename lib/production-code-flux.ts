import { supabaseServer } from "@/lib/supabase-server";
import { fetchPlCodeByGroupeId, fetchPdRefsBySourceGroupeId } from "@/lib/programme-numbering";
import {
  buildMouvementInfoByRowId,
  fetchWebMouvementSourceRows,
  traceProduitFiniPourCode,
  type MouvementSourceRow,
  type TraceEntreeProduction,
  type TraceSortie,
} from "@/app/mouvements/shared";

export type CodeFluxRef = { label: string; href: string };

export type CodeFluxTi = { label: string; href: string; statut: string };

export type CodeFluxTo = { label: string; href: string; statut: string; tis: CodeFluxTi[] };

export type CodeFluxMpSource = {
  articleNom: string;
  numeroLot: string | null;
  depotNom: string;
  quantiteReservee: number;
  tos: CodeFluxTo[];
};

export type CodeFlux = {
  code: string;
  pl: CodeFluxRef | null;
  pds: CodeFluxRef[];
  produit: string | null;
  mpSources: CodeFluxMpSource[];
  entreeProduction: TraceEntreeProduction;
  sorties: TraceSortie[];
};

// Contexte partage (mouvements web + numerotation PL/PD charges UNE SEULE
// FOIS) pour tracer plusieurs codes sans refaire tourner
// fetchWebMouvementSourceRows/fetchPlCodeByGroupeId/fetchPdRefsBySourceGroupeId
// a chaque code - une meme page PL/PD peut avoir plusieurs codes (numero_lot
// splitte en plusieurs lots).
export type CodeFluxContext = {
  webRows: MouvementSourceRow[];
  mouvementInfoByRowId: Map<number, { code: string; groupeId: number }>;
  plCodeByGroupeId: Map<number, string>;
  pdRefsBySourceGroupeId: Map<number, { code: string; groupeId: number }[]>;
};

export async function buildCodeFluxContext(): Promise<CodeFluxContext> {
  const [webRows, plCodeByGroupeId, pdRefsBySourceGroupeId] = await Promise.all([
    fetchWebMouvementSourceRows(),
    fetchPlCodeByGroupeId(),
    fetchPdRefsBySourceGroupeId(),
  ]);
  return { webRows, mouvementInfoByRowId: buildMouvementInfoByRowId(webRows), plCodeByGroupeId, pdRefsBySourceGroupeId };
}

// Retrouve le/les Transfer Order qui ont REELLEMENT livre un (article MP,
// lot, depot) precis - uniquement via un Transfer Invoice VALIDE
// (invoice_order_lignes, le stock a vraiment bouge). Contrairement au Flux
// TO/TI (app/depots/transfer-order/flux.ts), qui repond "qu'est-ce que CE
// TO a livre" et peut donc se rabattre sur l'allocation prevue
// (transfer_order_ligne_lots) tant qu'aucun TI n'existe encore, la question
// ici est inverse : "quel TO a livre le stock que CE code a consomme" - un
// TO jamais valide n'a physiquement rien deplace, ce n'est pas une source
// reelle. Bug confirme par l'utilisateur : le repli affichait des TO
// n'ayant jamais livre le lot, juste alloue dessus sur le papier.
//
// Best-effort assume : un numero de lot reutilise (ex: "ancien_lot" pour du
// stock migre sans vrai lot) peut avoir ete livre par plusieurs TI
// distincts au fil du temps - AUCUN signal fiable ne permet de determiner
// lequel a precisement fourni ce code (verifie sur donnees reelles : ni la
// quantite livree, tres superieure et jamais alignee sur ce qu'un seul code
// reserve - un TI alimente un depot partage par plusieurs codes, jamais
// consomme 1-pour-1 - ni le delai entre la livraison et la reservation, un
// stock livre peut tres bien dormir plusieurs jours avant d'etre reserve).
// Le systeme actuel ne garde tout simplement AUCUN lien reservation -> TO/
// TI precis - tant que ca reste vrai, afficher tous les candidats reels
// (jamais un allegue jamais livre) est plus honnete que d'en exclure un a
// tort par une heuristique qui se trompera forcement dans d'autres cas.
async function fetchTosPourArticleLotDepot(
  articleMpId: number,
  numeroLot: string | null,
  depotId: number
): Promise<CodeFluxTo[]> {
  const { data: lignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, transfer_order_id")
    .eq("article_type", "MP")
    .eq("article_id", articleMpId);
  const ligneRows = (lignesData ?? []) as { id: number; transfer_order_id: number }[];
  if (ligneRows.length === 0) return [];
  const ligneIds = ligneRows.map((l) => l.id);
  const toIdByLigneId = new Map(ligneRows.map((l) => [l.id, l.transfer_order_id]));

  let invoiceQuery = supabaseServer
    .from("invoice_order_lignes")
    .select("transfer_order_ligne_id, invoice_order_id")
    .in("transfer_order_ligne_id", ligneIds);
  invoiceQuery = numeroLot === null ? invoiceQuery.is("numero_lot", null) : invoiceQuery.eq("numero_lot", numeroLot);
  const { data: invoiceLignesData } = await invoiceQuery;
  const invoiceRows = (invoiceLignesData ?? []) as { transfer_order_ligne_id: number; invoice_order_id: number }[];

  const toIds = new Set<number>();
  const invoiceIdsByToId = new Map<number, Set<number>>();

  if (invoiceRows.length > 0) {
    const invoiceIds = [...new Set(invoiceRows.map((r) => r.invoice_order_id))];
    const { data: invoiceOrdersData } = await supabaseServer
      .from("invoice_orders")
      .select("id")
      .in("id", invoiceIds)
      .eq("statut", "valide");
    const validInvoiceIds = new Set(((invoiceOrdersData ?? []) as { id: number }[]).map((io) => io.id));
    for (const row of invoiceRows) {
      if (!validInvoiceIds.has(row.invoice_order_id)) continue;
      const toId = toIdByLigneId.get(row.transfer_order_ligne_id);
      if (!toId) continue;
      toIds.add(toId);
      const set = invoiceIdsByToId.get(toId) ?? new Set<number>();
      set.add(row.invoice_order_id);
      invoiceIdsByToId.set(toId, set);
    }
  }

  if (toIds.size === 0) return [];

  const allInvoiceIds = [...new Set([...invoiceIdsByToId.values()].flatMap((set) => [...set]))];
  const [{ data: transferOrdersData }, { data: invoiceOrdersDetailData }] = await Promise.all([
    supabaseServer.from("transfer_orders").select("id, depot_destination_id, date_jour, numero, statut").in("id", [...toIds]),
    allInvoiceIds.length > 0
      ? supabaseServer.from("invoice_orders").select("id, date_jour, numero, statut").in("id", allInvoiceIds)
      : Promise.resolve({ data: [] as { id: number; date_jour: string; numero: number | null; statut: string }[] }),
  ]);
  const invoiceById = new Map(
    ((invoiceOrdersDetailData ?? []) as { id: number; date_jour: string; numero: number | null; statut: string }[]).map((io) => [io.id, io])
  );

  return ((transferOrdersData ?? []) as { id: number; depot_destination_id: number; date_jour: string; numero: number | null; statut: string }[])
    .filter((to) => to.depot_destination_id === depotId)
    .map((to) => ({
      label: `TO.${to.date_jour.slice(0, 4)}.${to.numero ?? to.id}`,
      href: `/depots/transfer-order/${to.id}`,
      statut: to.statut,
      tis: [...(invoiceIdsByToId.get(to.id) ?? [])]
        .map((ioId) => invoiceById.get(ioId))
        .filter((io): io is { id: number; date_jour: string; numero: number | null; statut: string } => !!io)
        .map((io) => ({
          label: `TI.${io.date_jour.slice(0, 4)}.${io.numero ?? io.id}`,
          href: `/depots/invoice-order/${io.id}`,
          statut: io.statut,
        })),
    }));
}

// Trace complete d'un code de dispatch precis - demande explicite : "je
// tape un code, il me dit le flux : PL, PD, TO, TI, TE, TS, entree,
// proforma livree". PL/PD viennent de programme_lignes ; la matiere
// premiere consommee et son/ses TO d'origine viennent de
// production_mp_reserve (garde la trace meme apres consommation complete,
// contrairement au Flux TO/TI qui ne regarde que le reste disponible) ;
// l'entree stock et la sortie/proforma du produit fini viennent de
// traceProduitFiniPourCode (meme fonction que le Flux TO/TI, jamais
// dupliquee).
export async function fetchCodeFlux(codeRaw: string, ctx: CodeFluxContext): Promise<CodeFlux | null> {
  const codeSaisi = codeRaw.trim();
  if (!codeSaisi) return null;

  // ilike sans wildcard = comparaison exacte insensible a la casse - un
  // utilisateur qui tape "aa4256" doit retrouver le code stocke "AA4256",
  // meme principe que matchesCode() dans lib/cout-production-reel.ts.
  const { data: termineData } = await supabaseServer
    .from("production_code_termine")
    .select("id, programme_ligne_id, code")
    .ilike("code", codeSaisi);
  const termineRows = (termineData ?? []) as { id: number; programme_ligne_id: number; code: string }[];
  if (termineRows.length === 0) return null;

  // Le vrai code stocke (casse exacte) - reutilise pour l'affichage et pour
  // matcher lots_stock.numero_lot plus bas (traceProduitFiniPourCode fait
  // deja sa propre comparaison insensible a la casse, mais autant retrouver
  // le libelle exact plutot que celui tape par l'utilisateur).
  const code = termineRows[0].code;

  const programmeLigneId = termineRows[0].programme_ligne_id;
  const { data: plData } = await supabaseServer
    .from("programme_lignes")
    .select("id, groupe_id, produit, article_id")
    .eq("id", programmeLigneId)
    .maybeSingle();
  const pl = plData as { id: number; groupe_id: number | null; produit: string | null; article_id: number | null } | null;

  const plRef: CodeFluxRef | null =
    pl?.groupe_id != null
      ? { label: ctx.plCodeByGroupeId.get(pl.groupe_id) ?? `PL-${pl.groupe_id}`, href: `/historique-programme/${pl.groupe_id}` }
      : null;
  const pds: CodeFluxRef[] =
    pl?.groupe_id != null
      ? (ctx.pdRefsBySourceGroupeId.get(pl.groupe_id) ?? []).map((ref) => ({
          label: ref.code,
          href: `/historique-programme-dispatcher/${ref.groupeId}`,
        }))
      : [];

  const { data: reserveData } = await supabaseServer
    .from("production_mp_reserve")
    .select("article_mp_id, depot_id, numero_lot, quantite_initiale")
    .in(
      "production_code_termine_id",
      termineRows.map((t) => t.id)
    );
  const reserves = (reserveData ?? []) as {
    article_mp_id: number;
    depot_id: number;
    numero_lot: string | null;
    quantite_initiale: number;
  }[];

  const parCle = new Map<string, { articleMpId: number; depotId: number; numeroLot: string | null; quantite: number }>();
  for (const r of reserves) {
    const key = `${r.article_mp_id}::${r.depot_id}::${r.numero_lot ?? ""}`;
    const existing = parCle.get(key);
    if (existing) existing.quantite += Number(r.quantite_initiale ?? 0);
    else
      parCle.set(key, {
        articleMpId: r.article_mp_id,
        depotId: r.depot_id,
        numeroLot: r.numero_lot,
        quantite: Number(r.quantite_initiale ?? 0),
      });
  }

  const mpSources: CodeFluxMpSource[] = [];
  for (const { articleMpId, depotId, numeroLot, quantite } of parCle.values()) {
    const [{ data: articleData }, { data: depotData }, tos] = await Promise.all([
      supabaseServer.from("articles_matiere_premiere").select("nom_article").eq("id", articleMpId).maybeSingle(),
      supabaseServer.from("depots").select("nom").eq("id", depotId).maybeSingle(),
      fetchTosPourArticleLotDepot(articleMpId, numeroLot, depotId),
    ]);

    mpSources.push({
      articleNom: (articleData as { nom_article: string } | null)?.nom_article ?? `#${articleMpId}`,
      numeroLot,
      depotNom: (depotData as { nom: string } | null)?.nom ?? `#${depotId}`,
      quantiteReservee: quantite,
      tos,
    });
  }

  const { entreeProduction, sorties } = traceProduitFiniPourCode(ctx.webRows, ctx.mouvementInfoByRowId, pl?.article_id, code);

  return {
    code,
    pl: plRef,
    pds,
    produit: pl?.produit ?? null,
    mpSources,
    entreeProduction,
    sorties,
  };
}
