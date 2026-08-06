"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeArticleFamilyKey, extractTrailingNumber, incrementCode } from "@/lib/article-code-family";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";

type PendingProgrammeRow = {
  zone: string;
  chaine: string;
  article_id: number | null;
  produit: string;
  type_article: string;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  plateforme: string;
  programe: string;
};

type ArticleFullInfo = {
  id: number;
  gamme: string | null;
  type_article: string | null;
  code_manu: string | null;
  code_auto: string | null;
  contenance: number | null;
  piece_par_carton: number | null;
  max_vrac_auto: number | null;
  vrac_max_manuel: number | null;
  min_vrac: number | null;
};

// Une ligne dispatcher = un lot physique reel (apres decoupage du vrac
// selon le max autorise) - "Programme par ligne" garde le vrac total tel
// quel, seul "Programme Dispatcher" voit les lots decoupes.
// batchKey identifie le lot LOGIQUE dont vient cette ligne : quand la meme
// FAMILLE (gamme+forme - ex: toutes les contenances/variantes de "Gel
// Douche Dermatone", clarifiant et exfoliant confondus) est repartie sur
// plusieurs chaines et que leur besoin combine depasse le max, un lot
// logique peut etre partage entre 2 chaines/contenances (ex: chaine 1 =
// 4500, chaine 2 = 4500, max = 3000 -> 3 lots de 3000, le 2eme lot etant
// compose de 1500 pris sur chaine 1 + 1500 pris sur chaine 2, meme si les 2
// chaines ne font pas exactement le meme article_id).
// Les lignes qui partagent le meme batchKey recoivent alors le MEME code
// genere (voir generateAutoCodes), au lieu d'un code par ligne physique.
type DispatcherDraftRow = {
  zone: string;
  chaine: string;
  articleId: number;
  produit: string;
  qtVrac: number | null;
  qtCarton: number | null;
  plateforme: string;
  sourceIndex: number;
  batchKey: string;
};

function computeQtCarton(
  vrac: number | null,
  contenance: number | null,
  piecePerCarton: number | null
): number | null {
  if (!vrac || vrac <= 0) return null;
  if (!contenance || contenance <= 0) return null;
  if (!piecePerCarton || piecePerCarton <= 0) return null;

  return vrac / contenance / piecePerCarton;
}

// Decoupe un vrac total en lots ne depassant jamais le max autorise pour
// cet article/plateforme. Ex: 10000 avec un max de 3000 -> [3000, 3000,
// 3000, 1000]. Le decoupage n'a lieu qu'ici (cote Dispatcher), jamais dans
// "Programme par ligne" lui-meme.
function splitVracIntoBatches(totalVrac: number, max: number): number[] {
  const batches: number[] = [];
  let remaining = totalVrac;
  while (remaining > max) {
    batches.push(max);
    remaining -= max;
  }
  if (remaining > 0) batches.push(remaining);
  return batches;
}

async function fetchArticleInfoMap(articleIds: number[]): Promise<Map<number, ArticleFullInfo>> {
  const map = new Map<number, ArticleFullInfo>();
  if (articleIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("articles")
    .select(
      "id, gamme, type_article, code_manu, code_auto, contenance, piece_par_carton, max_vrac_auto, vrac_max_manuel, min_vrac"
    )
    .in("id", articleIds);

  for (const row of (data as ArticleFullInfo[] | null) ?? []) {
    map.set(row.id, row);
  }

  return map;
}

// Decoupe le vrac en lots dispatcher (voir splitVracIntoBatches) selon
// max_vrac_auto (Plateforme A) ou vrac_max_manuel (Plateforme M) de
// l'article - mais sur le TOTAL COMBINE de toutes les chaines qui font le
// meme article (+ plateforme) dans ce Save, pas ligne par ligne. Sans ca,
// 2 chaines a 4500 chacune (max 3000) donnaient 4 codes (3000+1500 sur
// chacune) au lieu des 3 lots reels de 3000 - le decoupage partage
// reproduit fidelement les lots physiques, quitte a ce qu'un lot soit
// materiellement reparti sur 2 chaines et partage donc un seul code.
function buildDispatcherDraftRows(
  filledRows: PendingProgrammeRow[],
  articleInfoById: Map<number, ArticleFullInfo>
): DispatcherDraftRow[] {
  const draftRows: DispatcherDraftRow[] = [];

  const groups = new Map<string, { row: PendingProgrammeRow; sourceIndex: number }[]>();
  const groupOrder: string[] = [];

  // Regroupe par FAMILLE (gamme+forme, ex: "DERMATONE::GEL DOUCHE") et non
  // par article_id exact : sans ca, 2 contenances differentes (300ml/500ml)
  // ou 2 variantes (clarifiant/exfoliant) du meme produit ne partageaient
  // jamais leur lot ni leur code, meme quand elles sont physiquement
  // fabriquees a partir du meme vrac et devraient donc se partager le meme
  // max de fabrication.
  filledRows.forEach((row, sourceIndex) => {
    const info = row.article_id ? articleInfoById.get(row.article_id) : undefined;
    const familyKey = computeArticleFamilyKey(row.produit, info?.gamme ?? null);
    const key = `${familyKey}::${row.plateforme}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push({ row, sourceIndex });
  });

  function pushIndependentPiece(entry: { row: PendingProgrammeRow; sourceIndex: number }, groupKey: string) {
    const articleId = entry.row.article_id as number;
    const info = articleInfoById.get(articleId);
    const vrac = entry.row.vrac_a_fabriquer;
    draftRows.push({
      zone: entry.row.zone,
      chaine: entry.row.chaine,
      articleId,
      produit: entry.row.produit,
      qtVrac: vrac,
      qtCarton: vrac !== null ? computeQtCarton(vrac, info?.contenance ?? null, info?.piece_par_carton ?? null) : null,
      plateforme: entry.row.plateforme,
      sourceIndex: entry.sourceIndex,
      batchKey: `${groupKey}::row::${entry.sourceIndex}`,
    });
  }

  const EPSILON = 1e-6;

  for (const groupKey of groupOrder) {
    const entries = groups.get(groupKey)!;
    const plateforme = entries[0].row.plateforme;

    // Le max est cense etre le meme pour toute la famille (c'est une
    // capacite de fabrication du vrac, pas une propriete de l'emballage) -
    // si la config differe malgre tout entre contenances/variantes, on
    // prend le premier max exploitable rencontre dans l'ordre des lignes.
    // Le min (min_vrac, taille minimale viable d'un lot) est cherche de la
    // meme facon - contrairement au max, il n'est pas separe par
    // plateforme.
    let max: number | null | undefined = null;
    let min: number | null | undefined = null;
    for (const entry of entries) {
      const info = entry.row.article_id ? articleInfoById.get(entry.row.article_id) : undefined;
      if (max === null) {
        const candidate = plateforme === "A" ? info?.max_vrac_auto : plateforme === "M" ? info?.vrac_max_manuel : null;
        if (candidate && candidate > 0) max = candidate;
      }
      if (min === null && info?.min_vrac && info.min_vrac > 0) {
        min = info.min_vrac;
      }
    }

    const totalVrac = entries.reduce((sum, entry) => sum + (entry.row.vrac_a_fabriquer ?? 0), 0);
    const hasMax = Boolean(max && max > 0);

    // Pas de max connu : chaque chaine garde son propre lot independant.
    if (!hasMax) {
      entries.forEach((entry) => pushIndependentPiece(entry, groupKey));
      continue;
    }

    const maxVal = max as number;

    // Le total combine (toutes contenances/chaines de la famille) tient
    // dans un seul lot max : un seul code partage pour tout le monde, meme
    // si chaque chaine prise individuellement aurait suffi pour son propre
    // lot (ex: 1500 + 1500 avec un max de 3000 -> 1 seul code, pas 2).
    if (totalVrac <= maxVal) {
      let batchIndex = 0;
      for (const entry of entries) {
        const vrac = entry.row.vrac_a_fabriquer;
        if (!vrac || vrac <= 0) {
          pushIndependentPiece(entry, groupKey);
          continue;
        }
        const info = articleInfoById.get(entry.row.article_id as number);
        draftRows.push({
          zone: entry.row.zone,
          chaine: entry.row.chaine,
          articleId: entry.row.article_id as number,
          produit: entry.row.produit,
          qtVrac: vrac,
          qtCarton: computeQtCarton(vrac, info?.contenance ?? null, info?.piece_par_carton ?? null),
          plateforme: entry.row.plateforme,
          sourceIndex: entry.sourceIndex,
          batchKey: `${groupKey}::batch::${batchIndex}`,
        });
      }
      continue;
    }

    const minVal = min && min > 0 ? min : 0;

    // Le min_vrac n'est pas configure sur cette famille : chaque chaine
    // recupere D'ABORD ses propres lots pleins (taille exactement max), qui
    // restent TOUJOURS independants (jamais partages) - seul le reliquat
    // (< max) de chaque chaine, s'il y en a un, part dans un pot commun
    // (2eme passe) pour eventuellement se combiner avec le reliquat d'une
    // autre chaine et former un lot complet.
    // Sans cette 1ere passe, l'ancien decoupage (remplissage glouton en
    // enchainant les chaines dans leur ordre d'arrivee) pouvait a tort
    // fragmenter/partager des lots deja pleins pour une seule chaine selon
    // cet ordre (ex: 1000 + 1000 + 300 avec un max de 1000 donnait parfois
    // 300+700 / 300+700 au lieu de 1000 / 1000 / 300 attendu, uniquement
    // parce que la chaine de 300 arrivait avant une des 2 de 1000).
    // Le partage entre chaines (ex: 4500 + 4500 avec un max de 3000 -> 3
    // lots de 3000, le 3eme compose de 1500 + 1500) reste possible mais
    // seulement pour les reliquats reels, jamais pour un lot qu'une seule
    // chaine remplit deja entierement.
    if (minVal <= 0) {
      let batchIndex = 0;
      const leftovers: { entry: (typeof entries)[number]; amount: number }[] = [];

      for (const entry of entries) {
        const articleId = entry.row.article_id as number;
        const info = articleInfoById.get(articleId);
        let remainingForRow = entry.row.vrac_a_fabriquer ?? 0;

        if (remainingForRow <= 0) {
          pushIndependentPiece(entry, groupKey);
          continue;
        }

        // Division entiere (pas une boucle "while > max") : sans elle, un
        // montant tombant EXACTEMENT sur max (ex: 1000 avec un max de 1000)
        // echoue le test ">" et finit a tort dans le pot commun des
        // reliquats plus bas, ce qui reintroduit la dependance a l'ordre
        // des chaines qu'on cherche justement a eliminer ici.
        const wholeLots = Math.floor((remainingForRow + EPSILON) / maxVal);
        for (let i = 0; i < wholeLots; i++) {
          batchIndex += 1;
          draftRows.push({
            zone: entry.row.zone,
            chaine: entry.row.chaine,
            articleId,
            produit: entry.row.produit,
            qtVrac: maxVal,
            qtCarton: computeQtCarton(maxVal, info?.contenance ?? null, info?.piece_par_carton ?? null),
            plateforme: entry.row.plateforme,
            sourceIndex: entry.sourceIndex,
            batchKey: `${groupKey}::batch::${batchIndex}`,
          });
        }
        remainingForRow = Math.round((remainingForRow - wholeLots * maxVal) * 100) / 100;

        if (remainingForRow > EPSILON) {
          leftovers.push({ entry, amount: remainingForRow });
        }
      }

      const totalLeftover = leftovers.reduce((sum, item) => sum + item.amount, 0);

      if (totalLeftover > EPSILON) {
        const sharedBatches = splitVracIntoBatches(totalLeftover, maxVal);
        let sharedBatchIndex = 0;
        let remainingInBatch = sharedBatches[0] ?? 0;

        for (const item of leftovers) {
          const articleId = item.entry.row.article_id as number;
          const info = articleInfoById.get(articleId);
          let remainingForRow = item.amount;

          // Tolerance anti virgule-flottante : sans elle, un residu du
          // style 0.0000000002 peut laisser remainingForRow/remainingInBatch
          // legerement au-dessus de 0 au lieu d'exactement 0, ce qui cree
          // un lot fantome supplementaire pour une quantite quasi nulle.
          while (remainingForRow > EPSILON) {
            if (remainingInBatch <= EPSILON) {
              sharedBatchIndex += 1;
              remainingInBatch = sharedBatches[sharedBatchIndex] ?? remainingForRow;
            }

            const piece = Math.round(Math.min(remainingForRow, remainingInBatch) * 100) / 100;

            draftRows.push({
              zone: item.entry.row.zone,
              chaine: item.entry.row.chaine,
              articleId,
              produit: item.entry.row.produit,
              qtVrac: piece,
              qtCarton: computeQtCarton(piece, info?.contenance ?? null, info?.piece_par_carton ?? null),
              plateforme: item.entry.row.plateforme,
              sourceIndex: item.entry.sourceIndex,
              batchKey: `${groupKey}::leftover::${sharedBatchIndex}`,
            });

            remainingForRow -= piece;
            remainingInBatch -= piece;
          }
        }
      }

      continue;
    }

    // min_vrac configure : meme principe de base que ci-dessus (chaque
    // chaine recupere D'ABORD ses propres lots pleins, toujours
    // independants ; seul le reliquat de chaque chaine part dans un pot
    // commun), MAIS avec un decoupage du pot commun different : au lieu de
    // remplir bêtement au plus proche du max (ce qui peut fractionner un
    // reliquat entre 2 chaines sans raison), les reliquats sont combines
    // DANS L'ORDRE sans jamais fractionner une chaine entre 2 lots sauf
    // necessite (pour completer le dernier lot jusqu'au minimum viable).
    // Un reliquat qui tient deja seul dans le lot en cours y reste entier ;
    // des qu'il ne rentre plus, le lot en cours est ferme TEL QUEL (jamais
    // fractionne pour le completer) et le reliquat suivant en ouvre un
    // nouveau - ce qui fait que 2 reliquats dont la somme depasse le max
    // gardent chacun leur propre lot (jamais de partage inutile), tandis que
    // 2 petits reliquats dont la somme rentre dans un seul lot max le
    // partagent (1 seul code au lieu de 2, plutot que de gaspiller la moitie
    // du lot chacun).
    // Ex (max 3000, min 1500) : 2000 + 2000 -> aucun reliquat (chaque chaine
    // tient deja sous le max), donc 2 lots independants directement, deja
    // au dessus du min ; 1000 + 2500 -> memes raisons, chacune garde son
    // propre lot, mais le 1000 est alors en dessous du min - la passe
    // suivante lui emprunte 500 au lot voisin (2500) pour former un 1er lot
    // de 1500 partage, le reliquat de 2000 restant un 2eme lot independant ;
    // 4500 + 4500 -> chaque chaine prend d'abord 1 lot plein de 3000
    // (independant), puis leurs reliquats de 1500 chacun se combinent en 1
    // seul lot partage de 3000 (pas 2 lots independants de 1500). Ex (max
    // 1000, min 10) : 500 + 500 -> aucun reliquat non plus (chaque chaine
    // tient sous le max), mais le 2eme reliquat (implicite, chaque chaine
    // entiere devient son propre "reliquat" ici) tient exactement dans le
    // lot ouvert par le 1er (500+500=1000) -> 1 seul code partage.
    type LotContribution = { entry: (typeof entries)[number]; amount: number };
    type Lot = { contributions: LotContribution[]; total: number };
    const lots: Lot[] = [];
    const leftovers: { entry: (typeof entries)[number]; amount: number }[] = [];

    for (const entry of entries) {
      let remainingForRow = entry.row.vrac_a_fabriquer ?? 0;

      if (remainingForRow <= 0) {
        pushIndependentPiece(entry, groupKey);
        continue;
      }

      // Division entiere (voir la branche minVal<=0 ci-dessus pour le
      // detail de ce choix face a une boucle "while > max").
      const wholeLots = Math.floor((remainingForRow + EPSILON) / maxVal);
      for (let i = 0; i < wholeLots; i++) {
        lots.push({ contributions: [{ entry, amount: maxVal }], total: maxVal });
      }
      remainingForRow = Math.round((remainingForRow - wholeLots * maxVal) * 100) / 100;

      if (remainingForRow > EPSILON) {
        leftovers.push({ entry, amount: remainingForRow });
      }
    }

    let openLot: Lot | null = null;

    for (const item of leftovers) {
      let remainingForRow = item.amount;

      while (remainingForRow > EPSILON) {
        if (!openLot) {
          openLot = { contributions: [], total: 0 };
          lots.push(openLot);
        }

        const spaceLeft = Math.round((maxVal - openLot.total) * 100) / 100;

        if (remainingForRow <= spaceLeft + EPSILON) {
          // Tout le reliquat tient dans le lot ouvert : garde entier.
          openLot.contributions.push({ entry: item.entry, amount: remainingForRow });
          openLot.total = Math.round((openLot.total + remainingForRow) * 100) / 100;
          remainingForRow = 0;
          if (openLot.total >= maxVal - EPSILON) openLot = null;
          continue;
        }

        // Ne rentre pas dans le lot deja entame : ferme tel quel (jamais
        // fractionne pour le completer), le reliquat suivant ouvrira le lot
        // suivant. Impossible ici qu'un reliquat depasse le max a lui seul
        // (deja extrait en lots pleins ci-dessus), donc pas besoin du cas
        // "lot vide mais ne rentre pas quand meme".
        openLot = null;
      }
    }

    // Un lot peut rester en dessous du minimum viable - lui emprunter le
    // manque au lot voisin (suivant, sinon precedent) plutot que de le
    // laisser trop petit pour etre une vraie ligne de fabrication.
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (lot.total >= minVal - EPSILON) continue;

      const neighborIndex = i + 1 < lots.length ? i + 1 : i - 1;
      if (neighborIndex < 0) continue;
      const neighbor = lots[neighborIndex];

      const shortfall = Math.round((minVal - lot.total) * 100) / 100;
      let toBorrow = Math.min(shortfall, Math.round((neighbor.total - EPSILON) * 100) / 100);
      if (toBorrow <= EPSILON) continue;

      for (let c = neighbor.contributions.length - 1; c >= 0 && toBorrow > EPSILON; c--) {
        const contribution = neighbor.contributions[c];
        const take = Math.round(Math.min(contribution.amount, toBorrow) * 100) / 100;
        contribution.amount = Math.round((contribution.amount - take) * 100) / 100;
        lot.contributions.push({ entry: contribution.entry, amount: take });
        toBorrow = Math.round((toBorrow - take) * 100) / 100;
      }
      neighbor.contributions = neighbor.contributions.filter((c) => c.amount > EPSILON);
      neighbor.total = neighbor.contributions.reduce((sum, c) => sum + c.amount, 0);
      lot.total = lot.contributions.reduce((sum, c) => sum + c.amount, 0);
    }

    lots.forEach((lot, lotIndex) => {
      for (const contribution of lot.contributions) {
        const articleId = contribution.entry.row.article_id as number;
        const info = articleInfoById.get(articleId);
        draftRows.push({
          zone: contribution.entry.row.zone,
          chaine: contribution.entry.row.chaine,
          articleId,
          produit: contribution.entry.row.produit,
          qtVrac: contribution.amount,
          qtCarton: computeQtCarton(contribution.amount, info?.contenance ?? null, info?.piece_par_carton ?? null),
          plateforme: contribution.entry.row.plateforme,
          sourceIndex: contribution.entry.sourceIndex,
          batchKey: `${groupKey}::batch::${lotIndex}`,
        });
      }
    });
  }

  return draftRows;
}

// Genere automatiquement le code de chaque ligne dispatcher ou Plateforme
// est M (utilise code_manu) ou A (utilise code_auto) : les articles d'une
// meme gamme + type (ex: tous les "Lait" de la gamme "White Secret", toutes
// contenances confondues) partagent UN seul compteur. Le code repart du
// plus grand code deja connu dans la famille (pas seulement les articles
// de ce Save), incremente une fois par lot dispatcher, en alternant/
// tournant entre les differentes contenances (round-robin). A la fin, le
// dernier code genere est reecrit sur code_manu (ou code_auto) de TOUTE la
// famille (gamme+type), pas seulement les contenances touchees ici.
type AllArticleCodeRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  code_manu: string | null;
  code_auto: string | null;
};

async function fetchAllArticleCodeRows(): Promise<AllArticleCodeRow[]> {
  const rows: AllArticleCodeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, code_manu, code_auto")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as AllArticleCodeRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function generateAutoCodes(
  draftRows: DispatcherDraftRow[],
  articleInfoById: Map<number, ArticleFullInfo>,
  allArticles: AllArticleCodeRow[]
): Promise<{ codesByRowIndex: Map<number, string>; codeUpdatesByArticleId: Map<number, { code_manu?: string; code_auto?: string }> }> {
  const codesByRowIndex = new Map<number, string>();
  const codeUpdatesByArticleId = new Map<number, { code_manu?: string; code_auto?: string }>();

  // allArticles est fourni par l'appelant (pre-fetch en parallele du reste
  // au 1er essai, refetch frais a chaque retry - voir performProgrammeLigneSave)
  // plutot que fetche ici a chaque appel, pour paralleliser ce qui peut
  // l'etre au lieu d'enchainer les allers-retours reseau. La colonne
  // type_article est une categorie de formulation (clarifiant, hydratant...),
  // pas la forme du produit - deux articles de forme differente (Creme vs
  // Lait) peuvent partager le meme type_article. La forme (Lait/Creme/
  // DSR/...) vient donc TOUJOURS du nom de l'article, jamais de type_article
  // - seule la gamme peut venir de la colonne DB.
  const familyKeyById = new Map<number, string>();
  const membersByFamilyKey = new Map<string, AllArticleCodeRow[]>();

  for (const article of allArticles) {
    const key = computeArticleFamilyKey(article.nom_article, article.gamme);
    familyKeyById.set(article.id, key);
    const members = membersByFamilyKey.get(key) ?? [];
    members.push(article);
    membersByFamilyKey.set(key, members);
  }

  for (const [plateformeValue, field] of [
    ["M", "code_manu"],
    ["A", "code_auto"],
  ] as const) {
    // Un code se genere UNE fois par batchKey unique (lot logique), pas une
    // fois par ligne dispatcher physique - quand un lot est reparti sur
    // plusieurs chaines (voir buildDispatcherDraftRows), toutes ses lignes
    // partagent alors le meme code au lieu d'en recevoir chacune un.
    const seenBatchKeys = new Set<string>();
    const relevantBatches: { batchKey: string; articleId: number }[] = [];

    draftRows.forEach((row) => {
      if (row.plateforme !== plateformeValue || !articleInfoById.has(row.articleId)) return;
      if (seenBatchKeys.has(row.batchKey)) return;
      seenBatchKeys.add(row.batchKey);
      relevantBatches.push({ batchKey: row.batchKey, articleId: row.articleId });
    });

    if (relevantBatches.length === 0) continue;

    // Regroupe par gamme + forme (Lait/Creme/DSR/...) - un seul compteur
    // partage par famille.
    const groups = new Map<string, { batchKey: string; articleId: number }[]>();
    for (const entry of relevantBatches) {
      const groupKey = familyKeyById.get(entry.articleId) ?? "::";
      const list = groups.get(groupKey) ?? [];
      list.push(entry);
      groups.set(groupKey, list);
    }

    for (const [groupKey, groupEntries] of groups.entries()) {
      // Point de depart : le plus grand code deja connu parmi TOUS les
      // articles de cette famille (pas seulement ceux utilises dans ce
      // Save) - sinon une contenance non touchee aujourd'hui resterait sur
      // un vieux numero et entrerait en collision plus tard.
      const familyRows = membersByFamilyKey.get(groupKey) ?? [];
      const familyArticleIds = familyRows.map((row) => row.id);

      let seedCode: string | null = null;
      let seedNumber = -1;

      for (const row of familyRows) {
        const current = field === "code_manu" ? row.code_manu : row.code_auto;
        if (!current) continue;
        const num = extractTrailingNumber(current);
        if (num !== null && num > seedNumber) {
          seedNumber = num;
          seedCode = current;
        }
      }

      if (!seedCode) continue; // aucun code exploitable trouve, on laisse "code" tel quel

      // Repartition en tourniquet : un groupe de lots par article
      // (contenance), dans l'ordre d'apparition, puis on prend un lot par
      // article a tour de role jusqu'a ce que tout soit servi.
      const bucketsByArticle = new Map<number, { batchKey: string }[]>();
      const bucketOrder: number[] = [];
      for (const entry of groupEntries) {
        const articleId = entry.articleId;
        if (!bucketsByArticle.has(articleId)) {
          bucketsByArticle.set(articleId, []);
          bucketOrder.push(articleId);
        }
        bucketsByArticle.get(articleId)!.push({ batchKey: entry.batchKey });
      }

      let currentCode = seedCode;
      let remaining = groupEntries.length;
      const codeByBatchKey = new Map<string, string>();

      while (remaining > 0) {
        for (const articleId of bucketOrder) {
          const bucket = bucketsByArticle.get(articleId)!;
          if (bucket.length === 0) continue;

          const nextCode = incrementCode(currentCode);
          if (!nextCode) {
            remaining = 0;
            break;
          }

          currentCode = nextCode;
          const entry = bucket.shift()!;
          codeByBatchKey.set(entry.batchKey, currentCode);
          remaining -= 1;
        }
      }

      // Propage le code de chaque lot logique a TOUTES les lignes
      // dispatcher physiques qui partagent ce batchKey (lot reparti sur
      // plusieurs chaines).
      draftRows.forEach((row, index) => {
        const code = codeByBatchKey.get(row.batchKey);
        if (code) codesByRowIndex.set(index, code);
      });

      // Le dernier code genere est remis sur TOUTES les contenances de la
      // famille (gamme+forme+variante - ex: toutes les contenances de "Gel
      // Douche White Secret Clarifiant"), meme celles pas utilisees dans ce
      // Save - pas seulement celles touchees ici - pour que "Code par
      // article" reste toujours le meme code partout dans la famille. La
      // variante (Clarifiant/Exfoliant/...) fait partie de la famille (voir
      // detectArticleVariantFromName) : elle n'est donc PAS melangee avec
      // une autre variante de la meme gamme, qui garde son propre compteur.
      for (const articleId of familyArticleIds) {
        const existingUpdate = codeUpdatesByArticleId.get(articleId) ?? {};
        codeUpdatesByArticleId.set(articleId, { ...existingUpdate, [field]: currentCode });
      }
    }
  }

  return { codesByRowIndex, codeUpdatesByArticleId };
}

// Enregistre un nouveau groupe programme_lignes (saisie depuis la grille de
// "Programme par ligne"), puis le dispatche via assignDispatcherCodesAndInsert
// si withDispatch. Pour dispatcher un groupe DEJA enregistre plus tard (voir
// Historique programme, bouton "Dispatch"), voir
// dispatchExistingProgrammeLigneGroupAction, qui appelle directement
// assignDispatcherCodesAndInsert sans passer par ici (pas de nouveau groupe
// a creer).
// Repartit filledRows en lots Dispatcher (voir buildDispatcherDraftRows),
// genere leurs codes (voir generateAutoCodes), les insere dans
// programme_dispatcher_lignes, et reecrit numero_lot/numero_lot_detail sur
// les lignes programme_lignes correspondantes (rowIds, indexe comme
// filledRows). Partage entre un Save+Dispatch immediat
// (performProgrammeLigneSave) et un Dispatch differe d'un groupe deja
// enregistre (dispatchExistingProgrammeLigneGroupAction) - la gestion
// d'erreur (faut-il annuler programme_lignes ?) reste a la charge de
// l'appelant, differente dans les 2 cas.
async function assignDispatcherCodesAndInsert(
  filledRows: PendingProgrammeRow[],
  dateJour: string,
  groupeId: number,
  affectedZoneChaine: { zone: string; chaine: string }[],
  rowIds: number[]
): Promise<void> {
  const articleIds = [...new Set(filledRows.map((row) => row.article_id as number))];
  const [articleInfoById, allArticleCodeRows] = await Promise.all([
    fetchArticleInfoMap(articleIds),
    fetchAllArticleCodeRows(),
  ]);

  // Deux "Save"/"Dispatch" lances a quelques millisecondes d'ecart sur la
  // meme famille (gamme+forme) peuvent tous les deux lire le meme dernier
  // code connu avant que l'un des deux n'ait ecrit le sien, et generer le
  // meme code de lot - programme_dispatcher_lignes.code est unique en base
  // (voir add_programme_dispatcher_code_unique.sql) pour transformer cette
  // collision silencieuse en erreur detectable, qu'on rattrape ici en
  // recalculant un code frais (l'autre Save est deja commite a ce stade,
  // donc generateAutoCodes le voit et repart apres) plutot que de faire
  // echouer tout l'enregistrement.
  const MAX_CODE_ATTEMPTS = 6;
  let codesBySourceIndex = new Map<number, string[]>();
  let detailBySourceIndex = new Map<number, { code: string; qt_vrac: number | null; qt_carton: number | null }[]>();
  let dispatcherSucceeded = false;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const draftRows = buildDispatcherDraftRows(filledRows, articleInfoById);
    const articleCodeRowsForAttempt = attempt === 1 ? allArticleCodeRows : await fetchAllArticleCodeRows();
    const { codesByRowIndex, codeUpdatesByArticleId } = await generateAutoCodes(
      draftRows,
      articleInfoById,
      articleCodeRowsForAttempt
    );

    const rawDispatcherPayload = draftRows.map((row, index) => ({
      zone: row.zone,
      article_id: row.articleId,
      chaine: row.chaine,
      produit: row.produit || null,
      code: codesByRowIndex.get(index) || null,
      date_jour: dateJour,
      qt_carton: row.qtCarton,
      qt_vrac: row.qtVrac,
      groupe_id: groupeId,
    }));

    // Plusieurs contenances DIFFERENTES de la meme famille peuvent tomber
    // sur la MEME chaine (ex: 3 contenances d'un pommade programmees l'une
    // apres l'autre sur "CHAINE 10A") et partager le meme code (voir
    // buildDispatcherDraftRows) - la cle de fusion inclut donc article_id
    // (voir add_programme_dispatcher_code_unique_include_article.sql) : 2
    // contenances differentes restent 2 lignes Dispatcher separees, chacune
    // avec son propre "produit" et sa propre Qt Carton (2 contenances
    // differentes n'ont pas le meme nombre de pieces par carton, un total
    // fusionne serait inexploitable pour l'emballage). Seul un vrai doublon
    // (meme code, zone, chaine ET article_id - la meme piece physique
    // decoupee 2 fois dans le meme lot, cas non prevu de la repartition) est
    // fusionne ici (vrac et carton additionnes, chacun deja calcule avec la
    // contenance de sa propre piece avant fusion, donc le total reste exact)
    // plutot que d'etre laisse en doublon.
    const dispatcherPayload: typeof rawDispatcherPayload = [];
    const mergedIndexByKey = new Map<string, number>();
    for (const row of rawDispatcherPayload) {
      if (!row.code) {
        dispatcherPayload.push(row);
        continue;
      }
      const key = `${row.code}::${row.zone}::${row.chaine}::${row.article_id}`;
      const existingIndex = mergedIndexByKey.get(key);
      if (existingIndex === undefined) {
        mergedIndexByKey.set(key, dispatcherPayload.length);
        dispatcherPayload.push(row);
        continue;
      }
      const existing = dispatcherPayload[existingIndex];
      dispatcherPayload[existingIndex] = {
        ...existing,
        produit:
          existing.produit && row.produit && existing.produit !== row.produit
            ? `${existing.produit} + ${row.produit}`
            : existing.produit || row.produit,
        qt_carton: (existing.qt_carton ?? 0) + (row.qt_carton ?? 0),
        qt_vrac: (existing.qt_vrac ?? 0) + (row.qt_vrac ?? 0),
      };
    }

    // Detecte un doublon (code, zone, chaine, article_id) A L'INTERIEUR de ce
    // meme Save/Dispatch (pas contre des lignes deja en base) qui aurait
    // survecu a la fusion ci-dessus (cas non prevu) - un vrai conflit de ce
    // genre est deterministe (le meme code se regenere identique a chaque
    // tentative), donc retenter ne resoudra jamais rien : on le signale
    // immediatement avec le detail exact plutot que d'epuiser les 6
    // tentatives pour rien.
    const seenCodeZoneChaine = new Map<string, string[]>();
    for (const row of dispatcherPayload) {
      if (!row.code) continue;
      const key = `${row.code}::${row.zone}::${row.chaine}::${row.article_id}`;
      const list = seenCodeZoneChaine.get(key) ?? [];
      list.push(row.produit || "?");
      seenCodeZoneChaine.set(key, list);
    }
    const internalDuplicates = [...seenCodeZoneChaine.entries()].filter(([, produits]) => produits.length > 1);
    if (internalDuplicates.length > 0) {
      const detail = internalDuplicates
        .map(([key, produits]) => `${key} (${produits.join(" + ")})`)
        .join(" ; ");
      throw new Error(
        `Ce programme genere 2 fois le meme code sur la meme chaine avant meme d'enregistrer (bug de repartition, pas une collision entre 2 utilisateurs) : ${detail}`
      );
    }

    codesBySourceIndex = new Map<number, string[]>();
    detailBySourceIndex = new Map<number, { code: string; qt_vrac: number | null; qt_carton: number | null }[]>();
    draftRows.forEach((row, index) => {
      const code = codesByRowIndex.get(index);
      if (!code) return;
      const list = codesBySourceIndex.get(row.sourceIndex) ?? [];
      list.push(code);
      codesBySourceIndex.set(row.sourceIndex, list);

      const detailList = detailBySourceIndex.get(row.sourceIndex) ?? [];
      detailList.push({ code, qt_vrac: row.qtVrac, qt_carton: row.qtCarton });
      detailBySourceIndex.set(row.sourceIndex, detailList);
    });

    // 2 RPC totalement independantes (maj des codes articles, nettoyage des
    // zones dispatcher) lancees en parallele plutot qu'enchainees - aucune
    // n'a besoin du resultat de l'autre, ni du resultat de l'insert qui
    // suit (les valeurs passees a l'insert dispatcher viennent deja de
    // codesByRowIndex, calcule en memoire plus haut).
    const parallelWrites: PromiseLike<{ error: { message: string } | null }>[] = [];
    if (codeUpdatesByArticleId.size > 0) {
      parallelWrites.push(
        supabaseServer.rpc("articles_bulk_update_codes", {
          p_updates: [...codeUpdatesByArticleId.entries()].map(([articleId, updates]) => ({
            id: articleId,
            ...updates,
          })),
        })
      );
    }
    if (affectedZoneChaine.length > 0) {
      parallelWrites.push(
        supabaseServer.rpc("programme_dispatcher_clear_zones", { p_pairs: affectedZoneChaine })
      );
    }
    for (const { error: parallelWriteError } of await Promise.all(parallelWrites)) {
      if (parallelWriteError) {
        throw new Error(parallelWriteError.message);
      }
    }

    const { error: dispatcherError } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .insert(dispatcherPayload);

    if (!dispatcherError) {
      dispatcherSucceeded = true;
      break;
    }

    // 23505 = violation de contrainte unique - deux Save/Dispatch concurrents
    // ont genere le meme code, on relance avec un code recalcule. Toute
    // autre erreur est remontee immediatement (message brut, pas la peine
    // de le deguiser). Un petit delai aleatoire avant de retenter
    // desynchronise 2 tentatives qui se suivent de tres pres (sans lui,
    // elles peuvent se reproduire la meme collision a chaque tentative).
    if (dispatcherError.code !== "23505") {
      throw new Error(dispatcherError.message);
    }

    if (attempt === MAX_CODE_ATTEMPTS) {
      // Le message generique suppose une vraie collision entre 2 tentatives
      // concurrentes, mais un 23505 peut aussi venir d'une AUTRE contrainte
      // unique (ex: mauvaise hypothese, sequence desynchronisee...) - le
      // detail brut de Postgres est donc toujours inclus pour pouvoir
      // diagnostiquer la vraie cause si ca se reproduit de facon repetee
      // (une vraie collision concurrente ne devrait quasiment jamais
      // survivre a 6 tentatives avec delai aleatoire).
      throw new Error(
        `Un autre enregistrement s'est produit exactement au meme moment et a genere le meme code de lot (ou une autre erreur similaire). Reessaie. Detail technique : ${dispatcherError.message}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 350));
  }

  if (!dispatcherSucceeded) {
    throw new Error("Impossible de generer un code de lot unique apres plusieurs tentatives - reessaie.");
  }

  // Le numero de lot affiche sur "Programme par ligne"/Dashboard est
  // automatique : ce sont les memes codes que ceux generes pour le
  // Dispatcher (voir generateAutoCodes), reunis quand une ligne a ete
  // decoupee en plusieurs lots (join ", "), puis reecrits sur la ligne
  // programme_lignes d'origine juste apres son insertion.
  // numero_lot_detail fige la repartition qt_vrac/qt_carton par code au
  // moment du Save/Dispatch - contrairement a une lecture live du
  // Dispatcher (qui est un instantane de la production EN COURS et se fait
  // ecraser des qu'un Save/Dispatch ulterieur touche la meme zone/chaine),
  // cette colonne ne change plus jamais et permet donc au Dashboard de
  // toujours reconstituer le detail par code, meme longtemps apres que le
  // Dispatcher soit passe a autre chose.
  // Une seule requete RPC - un Save/relance avec beaucoup de lignes remplies
  // faisait autant d'allers-retours DB sequentiels ici, la principale source
  // de lenteur (et de depassement du temps limite serverless) sur les gros
  // Save.
  const numeroLotUpdates = [...codesBySourceIndex.entries()]
    .filter(([sourceIndex]) => rowIds[sourceIndex])
    .map(([sourceIndex, codes]) => ({
      id: rowIds[sourceIndex],
      numero_lot: [...new Set(codes)].join(", "),
      numero_lot_detail: detailBySourceIndex.get(sourceIndex) ?? [],
    }));

  if (numeroLotUpdates.length > 0) {
    const { error: numeroLotError } = await supabaseServer.rpc("programme_lignes_bulk_update_numero_lot", {
      p_updates: numeroLotUpdates,
    });

    if (numeroLotError) {
      throw new Error(numeroLotError.message);
    }
  }
}

async function performProgrammeLigneSave(
  filledRows: PendingProgrammeRow[],
  affectedZoneChaine: { zone: string; chaine: string }[],
  dateJour: string,
  creePar: string | null,
  remarque: string | null,
  // "Dispatch" (true) fait tout : enregistre programme_lignes ET peuple
  // Programme Dispatcher/Ravitailleur (comportement historique du Save).
  // "Save" (false) enregistre seulement programme_lignes (visible dans
  // Historique programme) sans toucher au Dispatcher - pour poser un
  // programme sans encore l'engager en fabrication.
  withDispatch: boolean
): Promise<{ ok: true; code: string; groupe_id: number }> {
  // Le code PL1.2026, PL2.2026... n'est pas stocke dans la colonne
  // "programe" (qui reste un champ libre tape par l'utilisateur,
  // independant) - il est seulement retourne ici pour le message de
  // confirmation. Le vrai code affiche dans l'historique est recalcule a la
  // lecture a partir du rang du groupe PARMI CEUX DE LA MEME ANNEE (meme
  // principe que TE1/TS1 dans Mouvements, mais remis a 1 a chaque nouvelle
  // annee de date_jour).
  const anneeJour = Number(dateJour.slice(0, 4));

  // "Programme par ligne" garde une ligne = une saisie, avec le vrac total
  // tel quel (pas de decoupage ici) et le "Programme" tape a la main.
  const payload = filledRows.map((row) => ({
    zone: row.zone,
    chaine: row.chaine,
    article_id: row.article_id,
    produit: row.produit || null,
    type_article: row.type_article || null,
    qt_carton: row.qt_carton,
    vrac_a_fabriquer: row.vrac_a_fabriquer,
    plateforme: row.plateforme || null,
    programe: row.programe.trim() || null,
    date_jour: dateJour,
    cree_par: creePar,
    remarque: remarque || null,
    // Un programme fraichement saisi n'est pas encore confirme pour le
    // suivi de production (Dashboard/Calendrier) - il ne le devient qu'une
    // fois valide via le bouton "Save" de Ravitailleur par ligne (voir
    // saveProgrammeDispatcherSnapshotAction / saveAllZonesDispatcherSnapshotAction),
    // qui bascule cette colonne a true. En attendant, seul Ravitailleur par
    // ligne (Programme Dispatcher) le montre.
    confirme_production: false,
  }));

  // 2 requetes totalement independantes (aucune n'a besoin du resultat de
  // l'autre) lancees en parallele plutot qu'enchainees - c'etait la
  // principale source de lenteur du Save (chaque aller-retour reseau
  // s'additionnait au precedent au lieu de se chevaucher). On compte les
  // groupe_id DISTINCTS de cette annee (pas le nombre de lignes, pas toute
  // la table) via RPC - rapatrier toute la table (6000+ lignes et ca
  // grossit) juste pour compter rendait le Save tres lent, voire le
  // faisait planter.
  const [nextNumberResult, insertResult] = await Promise.all([
    supabaseServer.rpc("programme_lignes_next_group_number_for_year", { p_year: anneeJour }),
    supabaseServer.from("programme_lignes").insert(payload).select("id"),
  ]);

  if (nextNumberResult.error) {
    throw new Error(nextNumberResult.error.message);
  }

  const nextNumber = Number(nextNumberResult.data) || 1;
  const generatedCode = `PL${nextNumber}.${anneeJour}`;

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  const insertedIds = ((insertResult.data as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupError } = await supabaseServer
    .from("programme_lignes")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupError) {
    throw new Error(groupError.message);
  }

  if (!withDispatch) {
    revalidatePath("/programe-par-ligne");
    revalidatePath("/historique-programme");
    return { ok: true, code: generatedCode, groupe_id: groupeId };
  }

  // Le Dispatcher (copie vers "Programme Dispatcher <ZONE>", codes,
  // numero_lot - voir assignDispatcherCodesAndInsert) peut echouer
  // (collision de code, bug de repartition...) - si ca arrive, les lignes
  // programme_lignes deja inserees ci-dessus sont effacees avant de faire
  // remonter l'erreur, pour qu'un Save rate ne laisse jamais un programme
  // "fantome" visible sur Suivi Production/Dashboard alors que son
  // Dispatcher/Ravitailleur n'a jamais ete cree.
  try {
    await assignDispatcherCodesAndInsert(filledRows, dateJour, groupeId, affectedZoneChaine, insertedIds);
  } catch (error) {
    await supabaseServer.from("programme_lignes").delete().in("id", insertedIds);
    throw error;
  }

  revalidatePath("/programe-par-ligne");
  revalidatePath("/ravitailleur-par-ligne");
  revalidatePath("/code-par-article");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");

  return { ok: true, code: generatedCode, groupe_id: groupeId };
}

// Next.js remplace tout throw non attrape venant d'une Server Action par un
// message generique en production ("An error occurred in the Server
// Components render...", sans le vrai message) - pour que l'utilisateur (et
// nous, en cas de rapport de bug) voit la vraie raison de l'echec, cette
// action attrape tout elle-meme et renvoie l'erreur comme donnee normale
// (ok:false + message) plutot que de la laisser remonter comme exception.
export async function saveProgrammeLigneBatchAction(
  formData: FormData
): Promise<{ ok: true; code: string; groupe_id: number } | { ok: false; message: string }> {
  try {
    const currentUser = await getCurrentStockUser();

    if (!(await canWritePageUser(currentUser, "programeParLigne"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas enregistrer de programme." };
    }

    const rawPayload = String(formData.get("payload") || "").trim();
    const dateJour = String(formData.get("date_jour") || "").trim();
    const remarque = String(formData.get("remarque") || "").trim() || null;
    const withDispatch = String(formData.get("with_dispatch") || "") === "1";

    if (!rawPayload) {
      return { ok: false, message: "Aucune ligne remplie a enregistrer." };
    }

    if (!dateJour) {
      return { ok: false, message: "Choisis la date du programme avant d'enregistrer." };
    }

    let rows: PendingProgrammeRow[] = [];

    try {
      rows = JSON.parse(rawPayload) as PendingProgrammeRow[];
    } catch {
      return { ok: false, message: "Le contenu du programme est invalide." };
    }

    const filledRows = rows.filter((row) => row.article_id);

    if (filledRows.length === 0) {
      return { ok: false, message: "Choisis au moins un produit avant d'enregistrer." };
    }

    // Remplace le contenu courant de chaque (zone, chaine) presente dans ce
    // Save - meme les chaines laissees vides (sans produit) sont effacees du
    // Dispatcher, pas seulement remplacees quand elles ont un produit. Ca
    // evite qu'une ancienne ligne reste affichee alors qu'elle n'est plus
    // remplie sur cette chaine.
    const affectedZoneChaineMap = new Map<string, { zone: string; chaine: string }>();
    for (const row of rows) {
      affectedZoneChaineMap.set(`${row.zone}::${row.chaine}`, { zone: row.zone, chaine: row.chaine });
    }
    const affectedZoneChaine = [...affectedZoneChaineMap.values()];

    return await performProgrammeLigneSave(
      filledRows,
      affectedZoneChaine,
      dateJour,
      currentUser,
      remarque,
      withDispatch
    );
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erreur inconnue pendant l'enregistrement.",
    };
  }
}

// Dispatche un groupe DEJA enregistre (voir Historique programme, bouton
// "Dispatch") vers Programme Dispatcher/Ravitailleur, sans creer de nouveau
// groupe ni dupliquer ses lignes programme_lignes (contrairement a l'ancien
// "Relancer", qui rejouait tout un nouveau Save) - utile pour un programme
// d'abord pose via Save (sans Dispatch) puis engage en fabrication plus
// tard, depuis sa propre page d'historique.
export async function dispatchExistingProgrammeLigneGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programeParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas dispatcher de programme.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Programme invalide.");
  }

  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .select(
      "id, zone, chaine, article_id, produit, type_article, qt_carton, vrac_a_fabriquer, plateforme, date_jour"
    )
    .eq("groupe_id", groupeId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const lignes = (data ?? []) as {
    id: number;
    zone: string;
    chaine: string;
    article_id: number | null;
    produit: string | null;
    type_article: string | null;
    qt_carton: number | null;
    vrac_a_fabriquer: number | null;
    plateforme: string | null;
    date_jour: string;
  }[];

  if (lignes.length === 0) {
    throw new Error("Programme introuvable.");
  }

  const remplies = lignes.filter((ligne) => ligne.article_id);

  const filledRows: PendingProgrammeRow[] = remplies.map((ligne) => ({
    zone: ligne.zone,
    chaine: ligne.chaine,
    article_id: ligne.article_id,
    produit: ligne.produit || "",
    type_article: ligne.type_article || "",
    qt_carton: ligne.qt_carton,
    vrac_a_fabriquer: ligne.vrac_a_fabriquer,
    plateforme: ligne.plateforme || "",
    programe: "",
  }));

  if (filledRows.length === 0) {
    throw new Error("Aucune ligne avec un article a dispatcher.");
  }

  const rowIds = remplies.map((ligne) => ligne.id);
  const dateJour = lignes[0].date_jour;

  // Efface TOUTE la grille (voir ZONE_GROUPS), pas seulement les chaines
  // remplies dans ce groupe : programme_lignes ne stocke jamais les
  // chaines laissees vides (elles ne sont jamais enregistrees), donc
  // impossible de savoir ici lesquelles etaient blanches dans le formulaire
  // d'origine - sans ca, une ancienne chaine dispatchee separement (ex:
  // CHAINE 9C) qui n'apparait pas dans CE groupe restait affichee au
  // Ravitailleur indefiniment, meme apres un nouveau Dispatch qui ne la
  // concerne plus. Un Dispatch (immediat ou differe depuis l'Historique)
  // represente toujours l'etat complet de toute la grille, jamais un ajout
  // partiel.
  const affectedZoneChaine = ZONE_GROUPS.flat();

  // Contrairement a performProgrammeLigneSave, aucune suppression en cas
  // d'echec : ces lignes programme_lignes existaient deja avant cet appel
  // (pas creees par lui), les effacer sur un echec de Dispatch perdrait un
  // programme deja valide pour rien.
  await assignDispatcherCodesAndInsert(filledRows, dateJour, groupeId, affectedZoneChaine, rowIds);

  revalidatePath("/historique-programme");
  revalidatePath(`/historique-programme/${groupeId}`);
  revalidatePath("/ravitailleur-par-ligne");
  revalidatePath("/code-par-article");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");

  redirect("/ravitailleur-par-ligne");
}

export async function deleteProgrammeLigneGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "historiqueProgramme"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer un programme.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Groupe invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .delete()
    .eq("groupe_id", groupeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/historique-programme");
  redirect("/historique-programme");
}
