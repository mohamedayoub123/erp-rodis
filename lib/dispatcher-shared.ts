import { computeArticleFamilyKey } from "@/lib/article-code-family";

// Partage entre "Programme par ligne" (app/programe-par-ligne/actions.ts) et
// "Programme" (app/production/programme/actions.ts) : les deux pages
// dispatchent vers la meme table programme_dispatcher_lignes et doivent
// decouper le vrac en lots physiques de la meme facon. Fonctions pures
// (aucun acces DB) - deplacees ici pour eviter toute divergence entre les 2
// implementations plutot que de dupliquer cette logique delicate.

export type ArticleFullInfo = {
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

// Une source a dispatcher : soit une ligne "Programme par ligne", soit une
// ligne "Programme" (MB) reformatee vers cette meme forme par l'appelant.
export type DispatchSourceRow = {
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
export type DispatcherDraftRow = {
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

export function computeQtCarton(
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
export function splitVracIntoBatches(totalVrac: number, max: number): number[] {
  const batches: number[] = [];
  let remaining = totalVrac;
  while (remaining > max) {
    batches.push(max);
    remaining -= max;
  }
  if (remaining > 0) batches.push(remaining);
  return batches;
}

// Decoupe le vrac en lots dispatcher (voir splitVracIntoBatches) selon
// max_vrac_auto (Plateforme A) ou vrac_max_manuel (Plateforme M) de
// l'article - mais sur le TOTAL COMBINE de toutes les chaines qui font le
// meme article (+ plateforme) dans ce Save, pas ligne par ligne. Sans ca,
// 2 chaines a 4500 chacune (max 3000) donnaient 4 codes (3000+1500 sur
// chacune) au lieu des 3 lots reels de 3000 - le decoupage partage
// reproduit fidelement les lots physiques, quitte a ce qu'un lot soit
// materiellement reparti sur 2 chaines et partage donc un seul code.
export function buildDispatcherDraftRows(
  filledRows: DispatchSourceRow[],
  articleInfoById: Map<number, ArticleFullInfo>
): DispatcherDraftRow[] {
  const draftRows: DispatcherDraftRow[] = [];

  const groups = new Map<string, { row: DispatchSourceRow; sourceIndex: number }[]>();
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

  function pushIndependentPiece(entry: { row: DispatchSourceRow; sourceIndex: number }, groupKey: string) {
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
          openLot.contributions.push({ entry: item.entry, amount: remainingForRow });
          openLot.total = Math.round((openLot.total + remainingForRow) * 100) / 100;
          remainingForRow = 0;
          if (openLot.total >= maxVal - EPSILON) openLot = null;
          continue;
        }

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
