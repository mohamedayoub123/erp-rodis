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
  datePeremption: string | null;
  estConditionnement: boolean;
  depotNom: string;
  quantiteReservee: number;
  tos: CodeFluxTo[];
};

// Articles de conditionnement (flacon, capsule, pompe, sleeve, carton,
// etiquette, etui, dispenseur) n'ont pas de catalogue separe - ce sont des
// lignes articles_matiere_premiere comme les autres, reperees par mot-cle
// dans leur nom (aucun champ "type" dedie sur cette table). Meme
// convention que DECHET_KEYWORDS (app/production/retours-conditionnement/
// page.tsx) et que les besoin_* sur articles (produit fini) - reunit les 2
// listes pour couvrir tout ce qu'un code peut consommer en conditionnement.
const CONDITIONNEMENT_KEYWORDS = [
  "FLACON",
  "POT",
  "CAPSULE",
  "POMPE",
  "SLEEVE",
  "CARTON",
  "ETIQUETTE",
  "ETUI",
  "DISPENSEUR",
  "TOPETTE",
  "SPRAY",
];

function estArticleConditionnement(nomArticle: string): boolean {
  const nomMajuscule = nomArticle.toUpperCase();
  return CONDITIONNEMENT_KEYWORDS.some((motCle) => nomMajuscule.includes(motCle));
}

export type CodeFluxStageEntry = {
  quantite: number;
  dateJour: string | null;
  machine: string | null;
  operateur: string | null;
  chefLigne: string | null;
  chefZone: string | null;
  // Roles specifiques a certaines etapes seulement (jamais tous remplis en
  // meme temps) - preparateur (Fabrication), ravitailleur/tireur
  // (Conditionnement), scotcheuse (Emballage).
  preparateur: string | null;
  ravitailleur: string | null;
  tireur: string | null;
  scotcheuse: string | null;
};

export type CodeFluxProduction = {
  fabrication: CodeFluxStageEntry[];
  conditionnement: CodeFluxStageEntry[];
  emballage: CodeFluxStageEntry[];
};

export type CodeFluxTestLabo = {
  utilisateur: string | null;
  datePriseEchantillon: string | null;
  dateSaisie: string | null;
  nomLabo: string | null;
  dispositionQualite: string | null;
  sousDerogation: boolean | null;
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degreAlcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  odeur: string | null;
  texture: string | null;
  tauxHumidite: number | null;
  pressionAtmospherique: number | null;
  temperatureTest: number | null;
  motifDerogation: string | null;
  remarque: string | null;
};

export type CodeFlux = {
  code: string;
  pl: CodeFluxRef | null;
  pds: CodeFluxRef[];
  produit: string | null;
  // Une seule valeur par code (saisie sur le rapport Fabrication), pas une
  // par fournee - vient de production_rapports.date_peremption.
  datePeremption: string | null;
  testLabo: CodeFluxTestLabo | null;
  mpSources: CodeFluxMpSource[];
  production: CodeFluxProduction;
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
// Un numero de lot reutilise (ex: "ancien_lot" pour du stock migre sans
// vrai lot) peut avoir ete livre par plusieurs TI distincts au fil du
// temps, chacun alimentant un depot partage par plusieurs codes/programmes
// - ni la quantite livree ni le delai reservation/livraison ne permettent
// de deviner LEQUEL a precisement fourni ce code (verifie sur donnees
// reelles, aucun des deux ne colle). Le VRAI signal fiable existe deja en
// base : un Transfer Order genere depuis "Verifier Stock" (Programme par
// ligne) porte source_groupe_id_programme_ligne = programme_lignes.groupe_id
// du programme pour lequel il a ete cree - confirme sur donnees reelles
// (TO.2026.58 porte le groupe_id exact de PL183.2026, les 2 autres TO qui
// touchent le meme lot n'ont PAS ce lien, generes pour un tout autre
// programme). Priorite absolue a ce lien quand il existe ; repli sur TOUS
// les candidats reels (jamais un TO qui n'a jamais livre) uniquement s'il
// n'existe pour aucun (TO manuel, ou genere depuis un Programme MB qui n'a
// pas cette meme colonne).
async function fetchTosPourArticleLotDepot(
  articleMpId: number,
  numeroLot: string | null,
  depotId: number,
  sourceGroupeIdProgrammeLigne: number | null
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
    supabaseServer
      .from("transfer_orders")
      .select("id, depot_destination_id, date_jour, numero, statut, source_groupe_id_programme_ligne")
      .in("id", [...toIds]),
    allInvoiceIds.length > 0
      ? supabaseServer.from("invoice_orders").select("id, date_jour, numero, statut").in("id", allInvoiceIds)
      : Promise.resolve({ data: [] as { id: number; date_jour: string; numero: number | null; statut: string }[] }),
  ]);
  const invoiceById = new Map(
    ((invoiceOrdersDetailData ?? []) as { id: number; date_jour: string; numero: number | null; statut: string }[]).map((io) => [io.id, io])
  );

  const transferOrders = (transferOrdersData ?? []) as {
    id: number;
    depot_destination_id: number;
    date_jour: string;
    numero: number | null;
    statut: string;
    source_groupe_id_programme_ligne: number | null;
  }[];

  const memeSourceQueLePl = sourceGroupeIdProgrammeLigne
    ? transferOrders.filter((to) => to.source_groupe_id_programme_ligne === sourceGroupeIdProgrammeLigne)
    : [];
  const retenus = memeSourceQueLePl.length > 0 ? memeSourceQueLePl : transferOrders;

  return retenus
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

// Production (Fabrication/Conditionnement/Emballage) d'un code - demande
// explicite : "qt fabrique, fabrique par qui, sur quelle machine". Interroge
// par CODE seul (pas par programme_ligne_id) car un meme code peut etre
// partage par plusieurs lignes (ex: meme article reparti sur 2 lignes
// "Programme par ligne" avec la meme cuve/lot - deja vu sur des donnees
// reelles) - chaque ligne source apparait alors comme une entree distincte
// au lieu d'etre perdue. Fabrication vient de production_rapports (seule
// table qui garde machine/preparateur - production_vrac_entries ne les a
// jamais eues) : contrairement a Conditionnement/Emballage, une ligne
// re-saisie efface donc l'ancienne machine/preparateur (meme limite deja
// connue que le bug d'ecrasement documente ailleurs - voir
// fetchDechetsByLigneCode) ; Conditionnement/Emballage viennent de
// production_carton_entries/production_emballage_entries qui gardent UNE
// ligne PAR FOURNEE avec leur propre machine/operateur, jamais ecrasees.
async function fetchProductionParCode(
  code: string
): Promise<{ production: CodeFluxProduction; datePeremption: string | null; testLabo: CodeFluxTestLabo | null }> {
  const [{ data: rapportRows }, { data: cartonRows }, { data: embRows }] = await Promise.all([
    supabaseServer
      .from("production_rapports")
      .select(
        "vrac_fabrique, date_saisie_fabrication, date_fabrication_conditionnement, date_peremption, machine, utilisateur_fabrication, preparateur, utilisateur_test_labo, date_prise_echantillon, date_saisie_test_labo, nom_labo, disposition_qualite, sous_derogation, ph, densite, viscosite, degre_alcool, stabilite, couleur, odeur, texture, taux_humidite, pression_atmospherique, temperature_test, motif_derogation, remarque"
      )
      .eq("code", code),
    supabaseServer
      .from("production_carton_entries")
      .select("quantite, date_jour, chaine, zone, utilisateur_conditionnement, chef_ligne, chef_zone, ravitailleur, tireur")
      .eq("code", code),
    supabaseServer
      .from("production_emballage_entries")
      .select("quantite, date_jour, emballage_machine, emballage_operateur, emballage_chef_zone, emballage_scotcheuse")
      .eq("code", code),
  ]);

  const rapportsData = (rapportRows ?? []) as {
    vrac_fabrique: number | null;
    date_saisie_fabrication: string | null;
    date_fabrication_conditionnement: string | null;
    date_peremption: string | null;
    machine: string | null;
    utilisateur_fabrication: string | null;
    preparateur: string | null;
    utilisateur_test_labo: string | null;
    date_prise_echantillon: string | null;
    date_saisie_test_labo: string | null;
    nom_labo: string | null;
    disposition_qualite: string | null;
    sous_derogation: boolean | null;
    ph: number | null;
    densite: number | null;
    viscosite: number | null;
    degre_alcool: number | null;
    stabilite: string | null;
    couleur: string | null;
    odeur: string | null;
    texture: string | null;
    taux_humidite: number | null;
    pression_atmospherique: number | null;
    temperature_test: number | null;
    motif_derogation: string | null;
    remarque: string | null;
  }[];

  const fabrication = rapportsData
    .filter((r) => r.vrac_fabrique !== null)
    .map((r) => ({
      quantite: Number(r.vrac_fabrique),
      // Date de fabrication saisie (remplace la date automatique dans Suivi
      // Production) prime sur l'horodatage de sauvegarde - demande
      // explicite, sinon la seule date visible ici etait celle du clic
      // "Enregistrer", pas la vraie date de fabrication.
      dateJour: r.date_fabrication_conditionnement || r.date_saisie_fabrication,
      machine: r.machine,
      operateur: r.utilisateur_fabrication,
      // Pas de chef de ligne/zone ici : ces colonnes existent sur
      // production_rapports mais AUCUN code du formulaire Fabrication ne les
      // ecrit (verifie - seul Conditionnement les alimente, sur sa propre
      // table production_carton_entries) - les afficher ici aurait montre
      // une donnee non fiable/perimee, jamais rattachee a la vraie
      // Fabrication.
      chefLigne: null,
      chefZone: null,
      preparateur: r.preparateur,
      ravitailleur: null,
      tireur: null,
      scotcheuse: null,
    }));

  const conditionnement = (
    (cartonRows ?? []) as {
      quantite: number;
      date_jour: string | null;
      chaine: string | null;
      zone: string | null;
      utilisateur_conditionnement: string | null;
      chef_ligne: string | null;
      chef_zone: string | null;
      ravitailleur: string | null;
      tireur: string | null;
    }[]
  ).map((r) => ({
    quantite: Number(r.quantite),
    dateJour: r.date_jour,
    // Zone + chaine (ex: "B1Z1 chaine 3") - la chaine seule ne suffit pas a
    // identifier la machine (le meme nom de chaine existe sur plusieurs
    // zones), demande explicite de l'utilisateur.
    machine: [r.zone, r.chaine].filter(Boolean).join(" ") || null,
    operateur: r.utilisateur_conditionnement,
    chefLigne: r.chef_ligne,
    chefZone: r.chef_zone,
    preparateur: null,
    ravitailleur: r.ravitailleur,
    tireur: r.tireur,
    scotcheuse: null,
  }));

  const emballage = (
    (embRows ?? []) as {
      quantite: number;
      date_jour: string | null;
      emballage_machine: string | null;
      emballage_operateur: string | null;
      emballage_chef_zone: string | null;
      emballage_scotcheuse: string | null;
    }[]
  ).map((r) => ({
    quantite: Number(r.quantite),
    dateJour: r.date_jour,
    machine: r.emballage_machine,
    // Le vrai operateur physique de cette fournee (emballage_operateur),
    // pas le compte qui a saisi le rapport (utilisateur_emballage) - meme
    // distinction que preparateur/ravitailleur/tireur ci-dessus.
    operateur: r.emballage_operateur,
    // Emballage n'a pas de "chef de ligne" distinct en base, uniquement un
    // chef de zone.
    chefLigne: null,
    chefZone: r.emballage_chef_zone,
    preparateur: null,
    ravitailleur: null,
    tireur: null,
    scotcheuse: r.emballage_scotcheuse,
  }));

  const datePeremption = rapportsData.find((r) => r.date_peremption)?.date_peremption ?? null;

  const testLaboRow = rapportsData.find((r) => r.utilisateur_test_labo);
  const testLabo: CodeFluxTestLabo | null = testLaboRow
    ? {
        utilisateur: testLaboRow.utilisateur_test_labo,
        datePriseEchantillon: testLaboRow.date_prise_echantillon,
        dateSaisie: testLaboRow.date_saisie_test_labo,
        nomLabo: testLaboRow.nom_labo,
        dispositionQualite: testLaboRow.disposition_qualite,
        sousDerogation: testLaboRow.sous_derogation,
        ph: testLaboRow.ph,
        densite: testLaboRow.densite,
        viscosite: testLaboRow.viscosite,
        degreAlcool: testLaboRow.degre_alcool,
        stabilite: testLaboRow.stabilite,
        couleur: testLaboRow.couleur,
        odeur: testLaboRow.odeur,
        texture: testLaboRow.texture,
        tauxHumidite: testLaboRow.taux_humidite,
        pressionAtmospherique: testLaboRow.pression_atmospherique,
        temperatureTest: testLaboRow.temperature_test,
        motifDerogation: testLaboRow.motif_derogation,
        remarque: testLaboRow.remarque,
      }
    : null;

  return { production: { fabrication, conditionnement, emballage }, datePeremption, testLabo };
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
    // "ancien_lot" est un numero place-holder pour du stock migre sans vrai
    // lot (voir fetchTosPourArticleLotDepot plus haut) - jamais une clef de
    // recherche valable sur lots_stock_matiere_premiere.
    const rechercherPeremption = numeroLot && numeroLot !== "ancien_lot";
    const [{ data: articleData }, { data: depotData }, tos, { data: lotStockData }] = await Promise.all([
      supabaseServer.from("articles_matiere_premiere").select("nom_article").eq("id", articleMpId).maybeSingle(),
      supabaseServer.from("depots").select("nom").eq("id", depotId).maybeSingle(),
      fetchTosPourArticleLotDepot(articleMpId, numeroLot, depotId, pl?.groupe_id ?? null),
      rechercherPeremption
        ? supabaseServer
            .from("lots_stock_matiere_premiere")
            .select("date_expiration")
            .eq("article_id", articleMpId)
            .eq("numero_lot", numeroLot)
            .not("date_expiration", "is", null)
            .order("date_expiration", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const articleNom = (articleData as { nom_article: string } | null)?.nom_article ?? `#${articleMpId}`;

    mpSources.push({
      articleNom,
      numeroLot,
      datePeremption: (lotStockData as { date_expiration: string } | null)?.date_expiration ?? null,
      estConditionnement: estArticleConditionnement(articleNom),
      depotNom: (depotData as { nom: string } | null)?.nom ?? `#${depotId}`,
      quantiteReservee: quantite,
      tos,
    });
  }

  const { entreeProduction, sorties } = traceProduitFiniPourCode(ctx.webRows, ctx.mouvementInfoByRowId, pl?.article_id, code);
  const { production, datePeremption, testLabo } = await fetchProductionParCode(code);

  return {
    code,
    pl: plRef,
    pds,
    produit: pl?.produit ?? null,
    datePeremption,
    testLabo,
    mpSources,
    production,
    entreeProduction,
    sorties,
  };
}
