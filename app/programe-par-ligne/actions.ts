"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeArticleFamilyKey, extractTrailingNumber, incrementCode } from "@/lib/article-code-family";

// Un Save avec beaucoup de chaines/zones (meme vides) pouvait declencher des
// dizaines de requetes vraiment simultanees (Promise.all sans limite) - trop
// pour le pool de connexions (PgBouncer) qui en rejetait certaines, faisant
// planter le rendu alors que l'insert programme_lignes (visible dans
// l'historique) avait deja reussi. Limite le nombre de requetes en vol a la
// fois, garde le gain de vitesse (plusieurs vagues au lieu d'une par ligne)
// sans saturer le pool.
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => PromiseLike<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

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
};

// Une ligne dispatcher = un lot physique reel (apres decoupage du vrac
// selon le max autorise) - "Programme par ligne" garde le vrac total tel
// quel, seul "Programme Dispatcher" voit les lots decoupes.
// batchKey identifie le lot LOGIQUE dont vient cette ligne : quand le meme
// article est reparti sur plusieurs chaines et que leur besoin combine
// depasse le max, un lot logique peut etre partage entre 2 chaines (ex:
// chaine 1 = 4500, chaine 2 = 4500, max = 3000 -> 3 lots de 3000, le 2eme
// lot etant compose de 1500 pris sur chaine 1 + 1500 pris sur chaine 2).
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
      "id, gamme, type_article, code_manu, code_auto, contenance, piece_par_carton, max_vrac_auto, vrac_max_manuel"
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

  filledRows.forEach((row, sourceIndex) => {
    const key = `${row.article_id}::${row.plateforme}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push({ row, sourceIndex });
  });

  function pushIndependentPiece(
    entry: { row: PendingProgrammeRow; sourceIndex: number },
    articleId: number,
    info: ArticleFullInfo | undefined,
    groupKey: string
  ) {
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

  for (const groupKey of groupOrder) {
    const entries = groups.get(groupKey)!;
    const articleId = entries[0].row.article_id as number;
    const info = articleInfoById.get(articleId);
    const max =
      entries[0].row.plateforme === "A"
        ? info?.max_vrac_auto
        : entries[0].row.plateforme === "M"
          ? info?.vrac_max_manuel
          : null;

    const totalVrac = entries.reduce((sum, entry) => sum + (entry.row.vrac_a_fabriquer ?? 0), 0);
    const hasMax = Boolean(info && max && max > 0);

    // Pas de max connu, ou le total combine tient dans un seul lot max :
    // chaque chaine garde son propre lot independant, comme avant - pas de
    // partage de code entre chaines quand ce n'est pas necessaire.
    if (!hasMax || totalVrac <= (max as number)) {
      entries.forEach((entry) => pushIndependentPiece(entry, articleId, info, groupKey));
      continue;
    }

    const sharedBatches = splitVracIntoBatches(totalVrac, max as number);
    let batchIndex = 0;
    let remainingInBatch = sharedBatches[0] ?? 0;

    for (const entry of entries) {
      let remainingForRow = entry.row.vrac_a_fabriquer ?? 0;

      if (remainingForRow <= 0) {
        pushIndependentPiece(entry, articleId, info, groupKey);
        continue;
      }

      while (remainingForRow > 0) {
        if (remainingInBatch <= 0) {
          batchIndex += 1;
          remainingInBatch = sharedBatches[batchIndex] ?? remainingForRow;
        }

        const piece = Math.min(remainingForRow, remainingInBatch);

        draftRows.push({
          zone: entry.row.zone,
          chaine: entry.row.chaine,
          articleId,
          produit: entry.row.produit,
          qtVrac: piece,
          qtCarton: computeQtCarton(piece, info?.contenance ?? null, info?.piece_par_carton ?? null),
          plateforme: entry.row.plateforme,
          sourceIndex: entry.sourceIndex,
          batchKey: `${groupKey}::batch::${batchIndex}`,
        });

        remainingForRow -= piece;
        remainingInBatch -= piece;
      }
    }
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
  articleInfoById: Map<number, ArticleFullInfo>
): Promise<{ codesByRowIndex: Map<number, string>; codeUpdatesByArticleId: Map<number, { code_manu?: string; code_auto?: string }> }> {
  const codesByRowIndex = new Map<number, string>();
  const codeUpdatesByArticleId = new Map<number, { code_manu?: string; code_auto?: string }>();

  // Un seul fetch de toute la table pour regrouper par gamme+forme. La
  // colonne type_article est une categorie de formulation (clarifiant,
  // hydratant...), pas la forme du produit - deux articles de forme
  // differente (Creme vs Lait) peuvent partager le meme type_article. La
  // forme (Lait/Creme/DSR/...) vient donc TOUJOURS du nom de l'article,
  // jamais de type_article - seule la gamme peut venir de la colonne DB.
  const allArticles = await fetchAllArticleCodeRows();
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
      // famille (gamme+type), meme celles pas utilisees dans ce Save - pas
      // seulement celles touchees ici - pour que "Code par article" reste
      // toujours le meme code partout dans la famille.
      for (const articleId of familyArticleIds) {
        const existingUpdate = codeUpdatesByArticleId.get(articleId) ?? {};
        codeUpdatesByArticleId.set(articleId, { ...existingUpdate, [field]: currentCode });
      }
    }
  }

  return { codesByRowIndex, codeUpdatesByArticleId };
}

export async function saveProgrammeLigneBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programeParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de programme.");
  }

  const rawPayload = String(formData.get("payload") || "").trim();
  const dateJour = String(formData.get("date_jour") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune ligne remplie a enregistrer.");
  }

  if (!dateJour) {
    throw new Error("Choisis la date du programme avant d'enregistrer.");
  }

  let rows: PendingProgrammeRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingProgrammeRow[];
  } catch {
    throw new Error("Le contenu du programme est invalide.");
  }

  const filledRows = rows.filter((row) => row.article_id);

  if (filledRows.length === 0) {
    throw new Error("Choisis au moins un produit avant d'enregistrer.");
  }

  // Le code MB1/MB2/MB3... n'est pas stocke dans la colonne "programe" (qui
  // reste un champ libre tape par l'utilisateur, independant) - il est
  // seulement retourne ici pour le message de confirmation. Le vrai code
  // affiche dans l'historique est recalcule a la lecture a partir du rang
  // du groupe (meme principe que TE1/TS1 dans Mouvements).
  // On compte les groupe_id DISTINCTS (pas le nombre de lignes) via RPC -
  // rapatrier toute la table (6000+ lignes et ca grossit) juste pour
  // compter rendait le Save tres lent, voire le faisait planter.
  const { data: nextNumberData, error: nextNumberError } = await supabaseServer.rpc(
    "programme_lignes_next_group_number"
  );

  if (nextNumberError) {
    throw new Error(nextNumberError.message);
  }

  const nextNumber = Number(nextNumberData) || 1;
  const generatedCode = `MB${nextNumber}`;

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
  }));

  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .insert(payload)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  const insertedIds = ((data as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupError } = await supabaseServer
    .from("programme_lignes")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupError) {
    throw new Error(groupError.message);
  }

  // Copie vers "Programme Dispatcher <ZONE>" : ici seulement, le vrac est
  // decoupe en lots (voir buildDispatcherDraftRows) et chaque lot recoit
  // son propre code genere (voir generateAutoCodes).
  const articleIds = [...new Set(filledRows.map((row) => row.article_id as number))];
  const articleInfoById = await fetchArticleInfoMap(articleIds);

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

  // Deux "Save" lances a quelques millisecondes d'ecart sur la meme famille
  // (gamme+forme) peuvent tous les deux lire le meme dernier code connu
  // avant que l'un des deux n'ait ecrit le sien, et generer le meme code de
  // lot - programme_dispatcher_lignes.code est unique en base (voir
  // add_programme_dispatcher_code_unique.sql) pour transformer cette
  // collision silencieuse en erreur detectable, qu'on rattrape ici en
  // recalculant un code frais (l'autre Save est deja commite a ce stade,
  // donc generateAutoCodes le voit et repart apres) plutot que de faire
  // echouer tout l'enregistrement.
  const MAX_CODE_ATTEMPTS = 3;
  let codesBySourceIndex = new Map<number, string[]>();
  let dispatcherSucceeded = false;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const draftRows = buildDispatcherDraftRows(filledRows, articleInfoById);
    const { codesByRowIndex, codeUpdatesByArticleId } = await generateAutoCodes(draftRows, articleInfoById);

    // Par vagues de 5 max plutot qu'un aller-retour DB par article touche en
    // serie (lent) ou tous en meme temps (peut saturer le pool, voir plus haut).
    const codeUpdateResults = await mapWithConcurrencyLimit(
      [...codeUpdatesByArticleId.entries()],
      5,
      ([articleId, updates]) => supabaseServer.from("articles").update(updates).eq("id", articleId)
    );

    const failedCodeUpdate = codeUpdateResults.find((result) => result.error);
    if (failedCodeUpdate?.error) {
      throw new Error(failedCodeUpdate.error.message);
    }

    const dispatcherPayload = draftRows.map((row, index) => ({
      zone: row.zone,
      article_id: row.articleId,
      chaine: row.chaine,
      produit: row.produit || null,
      code: codesByRowIndex.get(index) || null,
      date_jour: dateJour,
      qt_carton: row.qtCarton,
      qt_vrac: row.qtVrac,
    }));

    codesBySourceIndex = new Map<number, string[]>();
    draftRows.forEach((row, index) => {
      const code = codesByRowIndex.get(index);
      if (!code) return;
      const list = codesBySourceIndex.get(row.sourceIndex) ?? [];
      list.push(code);
      codesBySourceIndex.set(row.sourceIndex, list);
    });

    // Une requete .eq()/.eq() parametree par paire, plutot qu'un seul .or()
    // construit en interpolant zone/chaine (valeurs saisies cote client)
    // dans une chaine de filtre PostgREST brute - une valeur contenant une
    // virgule ou une parenthese pouvait sinon elargir le filtre et faire
    // supprimer des lignes en dehors des (zone, chaine) vraiment concernees
    // par ce Save.
    const clearResults = await mapWithConcurrencyLimit(affectedZoneChaine, 5, ({ zone, chaine }) =>
      supabaseServer.from("programme_dispatcher_lignes").delete().eq("zone", zone).eq("chaine", chaine)
    );

    const failedClear = clearResults.find((result) => result.error);
    if (failedClear?.error) {
      throw new Error(failedClear.error.message);
    }

    const { error: dispatcherError } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .insert(dispatcherPayload);

    if (!dispatcherError) {
      dispatcherSucceeded = true;
      break;
    }

    // 23505 = violation de contrainte unique - deux Save concurrents ont
    // genere le meme code, on relance avec un code recalcule. Toute autre
    // erreur est remontee immediatement.
    if (dispatcherError.code !== "23505" || attempt === MAX_CODE_ATTEMPTS) {
      throw new Error(dispatcherError.message);
    }
  }

  if (!dispatcherSucceeded) {
    throw new Error("Impossible de generer un code de lot unique apres plusieurs tentatives - reessaie.");
  }

  // Le numero de lot affiche sur "Programme par ligne"/Dashboard est
  // automatique : ce sont les memes codes que ceux generes pour le
  // Dispatcher (voir generateAutoCodes), reunis quand une ligne a ete
  // decoupee en plusieurs lots (join ", "), puis reecrits sur la ligne
  // programme_lignes d'origine juste apres son insertion.
  // Par vagues de 5 - un Save avec beaucoup de lignes remplies faisait
  // autant d'allers-retours DB sequentiels ici, la principale source de
  // lenteur sur les gros Save.
  const numeroLotResults = await mapWithConcurrencyLimit(
    [...codesBySourceIndex.entries()].filter(([sourceIndex]) => insertedIds[sourceIndex]),
    5,
    ([sourceIndex, codes]) =>
      supabaseServer
        .from("programme_lignes")
        .update({ numero_lot: [...new Set(codes)].join(", ") })
        .eq("id", insertedIds[sourceIndex])
  );

  const failedNumeroLot = numeroLotResults.find((result) => result.error);
  if (failedNumeroLot?.error) {
    throw new Error(failedNumeroLot.error.message);
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
