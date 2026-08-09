"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeArticleFamilyKey, extractTrailingNumber, incrementCode } from "@/lib/article-code-family";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import {
  buildDispatcherDraftRows,
  type ArticleFullInfo,
  type DispatchSourceRow as PendingProgrammeRow,
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

// Genere automatiquement le code de chaque ligne dispatcher ou Plateforme
// est M (utilise code_manu) ou A (utilise code_auto) : les articles d'une
// meme gamme + type (ex: tous les "Lait" de la gamme "White Secret", toutes
// contenances confondues) partagent UN seul compteur. Le code repart du
// plus grand code deja connu dans la famille (pas seulement les articles
// de ce Save), incremente une fois par lot dispatcher, en alternant/
// tournant entre les differentes contenances (round-robin). A la fin, le
// dernier code genere est reecrit sur code_manu (ou code_auto) de TOUTE la
// famille (gamme+type), pas seulement les contenances touchees ici.
export type AllArticleCodeRow = {
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

export async function generateAutoCodes(
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

// Le code genere au Dispatch ne doit alimenter "Code par article"
// (articles.code_manu/code_auto) qu'une fois le programme confirme sur
// Ravitailleur (voir dispatcher-actions.ts) - le garde en attente ici,
// fusionne avec une eventuelle attente deja posee pour ce meme groupe (un
// Dispatch peut toucher plusieurs zones/chaines d'affilee avant la
// confirmation ; un update qui ne touche que code_auto ne doit pas effacer
// un code_manu deja mis en attente par un update precedent du meme groupe).
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

    // Le code genere n'est PAS ecrit sur articles.code_manu/code_auto ici -
    // "Code par article" ne doit refleter que des codes CONFIRMES (voir
    // upsertPendingArticleCodeUpdates plus bas, applique seulement quand
    // Ravitailleur confirme le programme). Seul le nettoyage des zones
    // dispatcher (independant de tout ca) reste ici.
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

  if (finalCodeUpdatesByArticleId.size > 0) {
    await upsertPendingArticleCodeUpdates(groupeId, finalCodeUpdatesByArticleId);
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

    // Une ligne deja marquee "programme_termine" (ex: son ancien PD a ete
    // supprime depuis Historique Programme Dispatcher, voir
    // deleteProgrammeDispatcherHistoryGroupAction) redevient une ligne
    // active des qu'elle est redispatchee - sans ce reset elle restait
    // invisible du Dashboard pour toujours, meme une fois confirmee sur
    // Ravitailleur avec un nouveau code/PD.
    const dispatchedLigneIds = numeroLotUpdates.map((update) => update.id);
    const { error: reactivateError } = await supabaseServer
      .from("programme_lignes")
      .update({ programme_termine: false, programme_termine_date: null })
      .in("id", dispatchedLigneIds)
      .eq("programme_termine", true);

    if (reactivateError) {
      throw new Error(reactivateError.message);
    }

    // Une ligne deja confirmee (confirme_production=true) qui se fait
    // redispatcher recoit ICI un nouveau numero_lot/numero_lot_detail, mais
    // Ravitailleur ne l'a pas encore reconfirme avec ces nouveaux codes -
    // sans ce reset, le Dashboard continuait a la montrer (confirme_production
    // etait resté a true depuis l'ANCIENNE confirmation) avec les codes du
    // redispatch, jamais valides sur Ravitailleur (bug remonte : "Parfum
    // Target" visible en PD2 avec un code, mais un autre code sur le
    // Dashboard). Elle redisparait donc du Dashboard jusqu'a ce que
    // Ravitailleur confirme a nouveau (voir saveProgrammeDispatcherSnapshotAction).
    const { error: unconfirmError } = await supabaseServer
      .from("programme_lignes")
      .update({ confirme_production: false })
      .in("id", dispatchedLigneIds)
      .eq("confirme_production", true);

    if (unconfirmError) {
      throw new Error(unconfirmError.message);
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
