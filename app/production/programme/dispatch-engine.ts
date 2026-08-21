"use server";

// Moteur de dispatch partage - deplace tel quel depuis
// app/programe-par-ligne/actions.ts (page "Programme par ligne" supprimee)
// car "Programme" (MB) en depend directement (voir dispatchProgrammeAction,
// ../actions.ts) : generation des codes de lot, decoupage en lots
// Dispatcher, ecriture numero_lot/numero_lot_detail sur programme_lignes.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { computeArticleFamilyKey, extractTrailingNumber, incrementCode } from "@/lib/article-code-family";
import {
  buildDispatcherDraftRows,
  type ArticleFullInfo,
  type DispatchSourceRow,
  type DispatcherDraftRow,
} from "@/lib/dispatcher-shared";

export async function fetchArticleInfoMap(articleIds: number[]): Promise<Map<number, ArticleFullInfo>> {
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

type AllArticleCodeRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  code_manu: string | null;
  code_auto: string | null;
};

export async function fetchAllArticleCodeRows(): Promise<AllArticleCodeRow[]> {
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

// Genere automatiquement le code de chaque ligne dispatcher ou Plateforme
// est M (utilise code_manu) ou A (utilise code_auto) : les articles d'une
// meme gamme + type (ex: tous les "Lait" de la gamme "White Secret", toutes
// contenances confondues) partagent UN seul compteur. Le code repart
// TOUJOURS du code deja enregistre sur l'article dans "Code par article"
// (code_manu/code_auto), incremente une fois par lot dispatcher, en
// alternant/tournant entre les differentes contenances (round-robin). A la
// fin, le dernier code genere est reecrit sur code_manu (ou code_auto) de
// TOUTE la famille (gamme+type), pas seulement les contenances touchees
// ici.
//
// Ne consulte plus pending_article_code_updates pour choisir le depart (
// contrairement a une version precedente) : ca semblait eviter un doublon
// entre 2 Dispatchs consecutifs pas encore confirmes, mais un vieux
// Dispatch de test jamais confirme (ni jamais efface) y laissait un code
// pour toujours, qui gagnait alors sur une correction manuelle plus
// recente faite sur "Code par article" - bug reel confirme (Lait WHITE
// SECRET : code corrige a AA4250 sur "Code par article", le Dispatch
// generait quand meme a partir d'un vieux AA4264V jamais nettoye). Le
// risque de doublon entre 2 Dispatchs simultanes pas encore confirmes
// reste (rare, attrape par le retry sur conflit d'insertion plus bas si
// les 2 zones/chaines se recoupent) - prefere a un code qui ignore
// silencieusement une correction manuelle.
export async function generateAutoCodes(
  draftRows: DispatcherDraftRow[],
  articleInfoById: Map<number, ArticleFullInfo>,
  allArticles: AllArticleCodeRow[]
): Promise<{ codesByRowIndex: Map<number, string>; codeUpdatesByArticleId: Map<number, { code_manu?: string; code_auto?: string }> }> {
  const codesByRowIndex = new Map<number, string>();
  const codeUpdatesByArticleId = new Map<number, { code_manu?: string; code_auto?: string }>();

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
    const seenBatchKeys = new Set<string>();
    const relevantBatches: { batchKey: string; articleId: number }[] = [];

    draftRows.forEach((row) => {
      if (row.plateforme !== plateformeValue || !articleInfoById.has(row.articleId)) return;
      if (seenBatchKeys.has(row.batchKey)) return;
      seenBatchKeys.add(row.batchKey);
      relevantBatches.push({ batchKey: row.batchKey, articleId: row.articleId });
    });

    if (relevantBatches.length === 0) continue;

    const groups = new Map<string, { batchKey: string; articleId: number }[]>();
    for (const entry of relevantBatches) {
      const groupKey = familyKeyById.get(entry.articleId) ?? "::";
      const list = groups.get(groupKey) ?? [];
      list.push(entry);
      groups.set(groupKey, list);
    }

    for (const [groupKey, groupEntries] of groups.entries()) {
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

      if (!seedCode) continue;

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

      draftRows.forEach((row, index) => {
        const code = codeByBatchKey.get(row.batchKey);
        if (code) codesByRowIndex.set(index, code);
      });

      for (const articleId of familyArticleIds) {
        const existingUpdate = codeUpdatesByArticleId.get(articleId) ?? {};
        codeUpdatesByArticleId.set(articleId, { ...existingUpdate, [field]: currentCode });
      }
    }
  }

  return { codesByRowIndex, codeUpdatesByArticleId };
}

// Le code genere au Dispatch ne doit alimenter "Code par article"
// (articles.code_manu/code_auto) qu'une fois le programme confirme (Save) -
// le garde en attente ici, fusionne avec une eventuelle attente deja posee
// pour ce meme groupe.
export async function upsertPendingArticleCodeUpdates(
  groupeId: number,
  updates: Map<number, { code_manu?: string; code_auto?: string }>
): Promise<void> {
  const articleIds = [...updates.keys()];

  const { data: existingRows, error: fetchError } = await supabaseServer
    .from("pending_article_code_updates")
    .select("article_id, code_manu, code_auto")
    .eq("groupe_id", groupeId)
    .in("article_id", articleIds);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingByArticleId = new Map(
    ((existingRows as { article_id: number; code_manu: string | null; code_auto: string | null }[] | null) ?? []).map(
      (row) => [row.article_id, row]
    )
  );

  const mergedRows = articleIds.map((articleId) => {
    const existing = existingByArticleId.get(articleId);
    const update = updates.get(articleId)!;
    return {
      groupe_id: groupeId,
      article_id: articleId,
      code_manu: update.code_manu ?? existing?.code_manu ?? null,
      code_auto: update.code_auto ?? existing?.code_auto ?? null,
    };
  });

  const { error: upsertError } = await supabaseServer
    .from("pending_article_code_updates")
    .upsert(mergedRows, { onConflict: "groupe_id,article_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

// Repartit filledRows en lots Dispatcher (voir buildDispatcherDraftRows),
// genere leurs codes (voir generateAutoCodes), les insere dans
// programme_dispatcher_lignes, et reecrit numero_lot/numero_lot_detail sur
// les lignes programme_lignes correspondantes (rowIds, indexe comme
// filledRows).
export async function assignDispatcherCodesAndInsert(
  filledRows: DispatchSourceRow[],
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

  const MAX_CODE_ATTEMPTS = 6;
  let codesBySourceIndex = new Map<number, string[]>();
  let detailBySourceIndex = new Map<number, { code: string; qt_vrac: number | null; qt_carton: number | null }[]>();
  let finalCodeUpdatesByArticleId = new Map<number, { code_manu?: string; code_auto?: string }>();
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

    finalCodeUpdatesByArticleId = codeUpdatesByArticleId;
    if (affectedZoneChaine.length > 0) {
      const { error: clearZonesError } = await supabaseServer.rpc("programme_dispatcher_clear_zones", {
        p_pairs: affectedZoneChaine,
      });
      if (clearZonesError) {
        throw new Error(clearZonesError.message);
      }
    }

    const { error: dispatcherError } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .insert(dispatcherPayload);

    if (!dispatcherError) {
      dispatcherSucceeded = true;
      break;
    }

    if (dispatcherError.code !== "23505") {
      throw new Error(dispatcherError.message);
    }

    if (attempt === MAX_CODE_ATTEMPTS) {
      throw new Error(
        `Un autre enregistrement s'est produit exactement au meme moment et a genere le meme code de lot (ou une autre erreur similaire). Reessaie. Detail technique : ${dispatcherError.message}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 350));
  }

  if (!dispatcherSucceeded) {
    throw new Error("Impossible de generer un code de lot unique apres plusieurs tentatives - reessaie.");
  }

  if (finalCodeUpdatesByArticleId.size > 0) {
    await upsertPendingArticleCodeUpdates(groupeId, finalCodeUpdatesByArticleId);
  }

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

    const dispatchedLigneIds = numeroLotUpdates.map((update) => update.id);
    const { error: reactivateError } = await supabaseServer
      .from("programme_lignes")
      .update({ programme_termine: false, programme_termine_date: null })
      .in("id", dispatchedLigneIds)
      .eq("programme_termine", true);

    if (reactivateError) {
      throw new Error(reactivateError.message);
    }

    const { error: unconfirmError } = await supabaseServer
      .from("programme_lignes")
      .update({ confirme_production: false })
      .in("id", dispatchedLigneIds)
      .eq("confirme_production", true);

    if (unconfirmError) {
      throw new Error(unconfirmError.message);
    }
  }

  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
}
