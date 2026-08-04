"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeArticleFamilyKey, extractTrailingNumber, incrementCode } from "@/lib/article-code-family";

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
type DispatcherDraftRow = {
  zone: string;
  chaine: string;
  articleId: number;
  produit: string;
  qtVrac: number | null;
  qtCarton: number | null;
  plateforme: string;
  sourceIndex: number;
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

// Decoupe chaque ligne remplie en lots dispatcher (voir splitVracIntoBatches)
// selon max_vrac_auto (Plateforme A) ou vrac_max_manuel (Plateforme M) de
// l'article. Sans max connu, ou vrac <= max, une seule ligne dispatcher est
// creee (le vrac total tel quel).
function buildDispatcherDraftRows(
  filledRows: PendingProgrammeRow[],
  articleInfoById: Map<number, ArticleFullInfo>
): DispatcherDraftRow[] {
  const draftRows: DispatcherDraftRow[] = [];

  filledRows.forEach((row, sourceIndex) => {
    const articleId = row.article_id as number;
    const info = articleInfoById.get(articleId);
    const totalVrac = row.vrac_a_fabriquer;

    const max =
      row.plateforme === "A" ? info?.max_vrac_auto : row.plateforme === "M" ? info?.vrac_max_manuel : null;

    const batches =
      info && max && max > 0 && totalVrac && totalVrac > max
        ? splitVracIntoBatches(totalVrac, max)
        : [totalVrac ?? null];

    for (const batchVrac of batches) {
      draftRows.push({
        zone: row.zone,
        chaine: row.chaine,
        articleId,
        produit: row.produit,
        qtVrac: batchVrac,
        qtCarton: batchVrac !== null ? computeQtCarton(batchVrac, info?.contenance ?? null, info?.piece_par_carton ?? null) : null,
        plateforme: row.plateforme,
        sourceIndex,
      });
    }
  });

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
    const relevantIndexes = draftRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.plateforme === plateformeValue && articleInfoById.has(row.articleId));

    if (relevantIndexes.length === 0) continue;

    // Regroupe par gamme + forme (Lait/Creme/DSR/...) - un seul compteur
    // partage par famille.
    const groups = new Map<string, { row: DispatcherDraftRow; index: number }[]>();
    for (const entry of relevantIndexes) {
      const groupKey = familyKeyById.get(entry.row.articleId) ?? "::";
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
      const bucketsByArticle = new Map<number, { row: DispatcherDraftRow; index: number }[]>();
      const bucketOrder: number[] = [];
      for (const entry of groupEntries) {
        const articleId = entry.row.articleId;
        if (!bucketsByArticle.has(articleId)) {
          bucketsByArticle.set(articleId, []);
          bucketOrder.push(articleId);
        }
        bucketsByArticle.get(articleId)!.push(entry);
      }

      let currentCode = seedCode;
      let remaining = groupEntries.length;

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
          codesByRowIndex.set(entry.index, currentCode);
          remaining -= 1;
        }
      }

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
  // On compte les groupe_id DISTINCTS (pas le nombre de lignes) pour
  // numeroter les lots dans l'ordre.
  const existingGroupIds = new Set<number>();
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows, error: groupFetchError } = await supabaseServer
      .from("programme_lignes")
      .select("groupe_id")
      .range(fromIndex, fromIndex + pageSize - 1);

    if (groupFetchError) {
      throw new Error(groupFetchError.message);
    }

    const chunk = (groupRows as { groupe_id: number }[] | null) ?? [];
    chunk.forEach((row) => existingGroupIds.add(row.groupe_id));

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const nextNumber = existingGroupIds.size + 1;
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

  const draftRows = buildDispatcherDraftRows(filledRows, articleInfoById);
  const { codesByRowIndex, codeUpdatesByArticleId } = await generateAutoCodes(draftRows, articleInfoById);

  for (const [articleId, updates] of codeUpdatesByArticleId.entries()) {
    const { error: codeUpdateError } = await supabaseServer
      .from("articles")
      .update(updates)
      .eq("id", articleId);

    if (codeUpdateError) {
      throw new Error(codeUpdateError.message);
    }
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

  // Le numero de lot affiche sur "Programme par ligne"/Dashboard est
  // automatique : ce sont les memes codes que ceux generes pour le
  // Dispatcher (voir generateAutoCodes), reunis quand une ligne a ete
  // decoupee en plusieurs lots (join ", "), puis reecrits sur la ligne
  // programme_lignes d'origine juste apres son insertion.
  const codesBySourceIndex = new Map<number, string[]>();
  draftRows.forEach((row, index) => {
    const code = codesByRowIndex.get(index);
    if (!code) return;
    const list = codesBySourceIndex.get(row.sourceIndex) ?? [];
    list.push(code);
    codesBySourceIndex.set(row.sourceIndex, list);
  });

  for (const [sourceIndex, codes] of codesBySourceIndex.entries()) {
    const ligneId = insertedIds[sourceIndex];
    if (!ligneId) continue;

    const { error: numeroLotError } = await supabaseServer
      .from("programme_lignes")
      .update({ numero_lot: [...new Set(codes)].join(", ") })
      .eq("id", ligneId);

    if (numeroLotError) {
      throw new Error(numeroLotError.message);
    }
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

  // Une requete .eq()/.eq() parametree par paire, plutot qu'un seul .or()
  // construit en interpolant zone/chaine (valeurs saisies cote client) dans
  // une chaine de filtre PostgREST brute - une valeur contenant une virgule
  // ou une parenthese pouvait sinon elargir le filtre et faire supprimer des
  // lignes en dehors des (zone, chaine) vraiment concernees par ce Save.
  for (const { zone, chaine } of affectedZoneChaine) {
    const { error: clearDispatcherError } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .delete()
      .eq("zone", zone)
      .eq("chaine", chaine);

    if (clearDispatcherError) {
      throw new Error(clearDispatcherError.message);
    }
  }

  const { error: dispatcherError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .insert(dispatcherPayload);

  if (dispatcherError) {
    throw new Error(dispatcherError.message);
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
