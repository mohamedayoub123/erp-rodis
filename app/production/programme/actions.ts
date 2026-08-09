"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  fetchArticleInfoMap,
  fetchAllArticleCodeRows,
  generateAutoCodes,
  upsertPendingArticleCodeUpdates,
} from "@/app/programe-par-ligne/actions";
import { buildDispatcherDraftRows, type DispatchSourceRow } from "@/lib/dispatcher-shared";

async function requireProgrammeWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programme"))) {
    throw new Error("Cet utilisateur ne peut pas creer de programme.");
  }

  return currentUser;
}

function parseOptionalNumberValue(raw: FormDataEntryValue | null | undefined) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isNaN(value) ? null : value;
}

function parseIdValue(raw: FormDataEntryValue | undefined) {
  const value = Number(raw ?? "0");
  return value > 0 ? value : null;
}

// Plusieurs articles dans le meme programme, une ligne par article : tous
// les champs (article_id, machine_*, qt_*...) sont ecrits sous le meme nom
// sur chaque ligne du formulaire - getAll() les relit dans l'ordre du DOM,
// les tableaux se correspondent tous par position. Une seule date pour
// tout le programme, et un seul numero de programme (MB1, MB2...) partage
// par toutes les lignes de cet envoi - le prochain numero est simplement le
// plus grand numero_programme existant + 1.
export async function createProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);
  const remarque = String(formData.get("remarque") || "").trim() || null;
  const statut = String(formData.get("statut") || "").trim() || "En attente";

  const { data: dernierProgramme } = await supabaseServer
    .from("programmes")
    .select("numero_programme")
    .order("numero_programme", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numeroProgramme = ((dernierProgramme as { numero_programme: number | null } | null)?.numero_programme ?? 0) + 1;

  const articleIds = formData.getAll("article_id");
  const vracArticleIds = formData.getAll("vrac_article_id");
  const machineFabricationIds = formData.getAll("machine_fabrication_id");
  const machineConditionnementIds = formData.getAll("machine_conditionnement_id");
  const dureesMinutes = formData.getAll("duree_minutes");
  const qtCartons = formData.getAll("qt_carton");
  const qtVracs = formData.getAll("qt_vrac");
  const plateformes = formData.getAll("plateforme");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      article_id: parseIdValue(rawArticleId),
      vrac_article_id: parseIdValue(vracArticleIds[index]),
      machine_fabrication_id: parseIdValue(machineFabricationIds[index]),
      machine_conditionnement_id: parseIdValue(machineConditionnementIds[index]),
      duree_minutes: parseOptionalNumberValue(dureesMinutes[index]),
      qt_carton: parseOptionalNumberValue(qtCartons[index]) ?? 0,
      qt_vrac: parseOptionalNumberValue(qtVracs[index]) ?? 0,
      plateforme: plateformes[index] === "A" ? "A" : "M",
      date_jour: dateJour,
      numero_programme: numeroProgramme,
      remarque,
      statut,
      utilisateur: currentUser || null,
    }))
    .filter((ligne) => ligne.article_id !== null);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article au programme.");
  }

  const { error } = await supabaseServer.from("programmes").insert(lignes);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  redirect(`/production/programme/${numeroProgramme}`);
}

export async function deleteProgrammeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const programmeId = Number(formData.get("programme_id") || "0");
  if (!programmeId) {
    throw new Error("Programme invalide.");
  }
  const numeroProgramme = Number(formData.get("numero_programme") || "0");

  const { error } = await supabaseServer.from("programmes").delete().eq("id", programmeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  if (numeroProgramme) {
    revalidatePath(`/production/programme/${numeroProgramme}`);
  }
}

// Ajoute d'autres lignes/articles a un programme (MB) deja existant - meme
// convention getAll() que createProgrammeAction, mais garde la meme
// date_jour/remarque/statut que le groupe existant (partages par toutes
// les lignes d'un numero_programme) au lieu d'en allouer un nouveau.
export async function addLignesProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const { data: existant } = await supabaseServer
    .from("programmes")
    .select("date_jour, remarque, statut")
    .eq("numero_programme", numeroProgramme)
    .limit(1)
    .maybeSingle();

  if (!existant) {
    throw new Error("Programme introuvable.");
  }

  const articleIds = formData.getAll("article_id");
  const vracArticleIds = formData.getAll("vrac_article_id");
  const machineFabricationIds = formData.getAll("machine_fabrication_id");
  const machineConditionnementIds = formData.getAll("machine_conditionnement_id");
  const dureesMinutes = formData.getAll("duree_minutes");
  const qtCartons = formData.getAll("qt_carton");
  const qtVracs = formData.getAll("qt_vrac");
  const plateformes = formData.getAll("plateforme");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      article_id: parseIdValue(rawArticleId),
      vrac_article_id: parseIdValue(vracArticleIds[index]),
      machine_fabrication_id: parseIdValue(machineFabricationIds[index]),
      machine_conditionnement_id: parseIdValue(machineConditionnementIds[index]),
      duree_minutes: parseOptionalNumberValue(dureesMinutes[index]),
      qt_carton: parseOptionalNumberValue(qtCartons[index]) ?? 0,
      qt_vrac: parseOptionalNumberValue(qtVracs[index]) ?? 0,
      plateforme: plateformes[index] === "A" ? "A" : "M",
      date_jour: (existant as { date_jour: string }).date_jour,
      numero_programme: numeroProgramme,
      remarque: (existant as { remarque: string | null }).remarque,
      statut: (existant as { statut: string }).statut,
      utilisateur: currentUser || null,
    }))
    .filter((ligne) => ligne.article_id !== null);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article.");
  }

  const { error } = await supabaseServer.from("programmes").insert(lignes);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
}

export async function updateProgrammeLigneAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const programmeId = Number(formData.get("programme_id") || "0");
  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!programmeId) {
    throw new Error("Ligne invalide.");
  }

  const qtCarton = parseOptionalNumberValue(formData.get("qt_carton")) ?? 0;
  const qtVrac = parseOptionalNumberValue(formData.get("qt_vrac")) ?? 0;

  const { error } = await supabaseServer
    .from("programmes")
    .update({ qt_carton: qtCarton, qt_vrac: qtVrac })
    .eq("id", programmeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  if (numeroProgramme) {
    revalidatePath(`/production/programme/${numeroProgramme}`);
  }
}

// Remarque et Statut sont partages par toutes les lignes d'un meme
// numero_programme (meme "MB") - les modifier met a jour toutes les lignes
// du groupe d'un coup.
export async function updateProgrammeGroupeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const remarque = String(formData.get("remarque") || "").trim() || null;
  const statut = String(formData.get("statut") || "").trim() || "En attente";

  const { error } = await supabaseServer
    .from("programmes")
    .update({ remarque, statut })
    .eq("numero_programme", numeroProgramme);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
}

// Dispatche un programme (MB) vers programme_dispatcher_lignes, exactement
// comme le bouton "Dispatch" de "Programme par ligne" (meme decoupage en
// lots, meme generation de code) - voir buildDispatcherDraftRows/
// generateAutoCodes (lib/dispatcher-shared.ts et
// app/programe-par-ligne/actions.ts, reutilisees telles quelles pour eviter
// toute divergence entre les 2 pages).
//
// La zone/chaine viennent de la machine Conditionnement de chaque ligne
// (machines.zone / machines.nom - "chaine 1" etc.), pas d'une liste fixe
// comme sur Programme par ligne. groupe_id est negatif (-numero_programme)
// pour ne jamais entrer en collision avec un vrai groupe_id de
// programme_lignes (toujours positif) : ce programme n'a pas de
// numero_lot/confirme_production a mettre a jour en retour (colonnes qui
// n'existent que sur programme_lignes), seul le Dispatcher + le code
// article en attente sont ecrits ici.
export async function dispatchProgrammeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("programmes")
    .select("article_id, machine_conditionnement_id, qt_vrac, plateforme, date_jour")
    .eq("numero_programme", numeroProgramme);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as {
    article_id: number;
    machine_conditionnement_id: number | null;
    qt_vrac: number;
    plateforme: string | null;
    date_jour: string;
  }[];

  if (lignes.length === 0) {
    throw new Error("Programme introuvable.");
  }

  const machineIds = [...new Set(lignes.map((l) => l.machine_conditionnement_id).filter((id): id is number => !!id))];
  const articleIds = [...new Set(lignes.map((l) => l.article_id))];

  const [{ data: machinesData }, { data: articlesData }] = await Promise.all([
    supabaseServer.from("machines").select("id, nom, zone").in("id", machineIds),
    supabaseServer.from("articles").select("id, nom_article, type_article").in("id", articleIds),
  ]);

  const machineById = new Map(
    ((machinesData ?? []) as { id: number; nom: string; zone: string | null }[]).map((m) => [m.id, m])
  );
  const articleById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string; type_article: string | null }[]).map((a) => [a.id, a])
  );

  const dateJour = lignes[0].date_jour;
  const filledRows: DispatchSourceRow[] = lignes.map((ligne) => {
    const machine = ligne.machine_conditionnement_id ? machineById.get(ligne.machine_conditionnement_id) : null;
    if (!machine || !machine.zone) {
      const nomArticle = articleById.get(ligne.article_id)?.nom_article ?? `#${ligne.article_id}`;
      throw new Error(
        `${nomArticle} : la machine Conditionnement doit avoir une Zone configuree (page Machines) pour pouvoir dispatcher.`
      );
    }
    const article = articleById.get(ligne.article_id);
    return {
      zone: machine.zone,
      chaine: machine.nom,
      article_id: ligne.article_id,
      produit: article?.nom_article ?? "",
      type_article: article?.type_article ?? "",
      qt_carton: null,
      vrac_a_fabriquer: ligne.qt_vrac || null,
      plateforme: ligne.plateforme === "A" ? "A" : "M",
      programe: `MB${numeroProgramme}`,
    };
  });

  const affectedZoneChaine = [
    ...new Map(filledRows.map((row) => [`${row.zone}::${row.chaine}`, { zone: row.zone, chaine: row.chaine }])).values(),
  ];

  // Negatif = vient de Programme (MB), jamais d'un vrai groupe_id
  // programme_lignes (toujours positif, = min(id) des lignes inserees).
  const groupeId = -numeroProgramme;

  const articleIdsForInfo = [...new Set(filledRows.map((row) => row.article_id as number))];
  const [articleInfoById, allArticleCodeRows] = await Promise.all([
    fetchArticleInfoMap(articleIdsForInfo),
    fetchAllArticleCodeRows(),
  ]);

  const MAX_CODE_ATTEMPTS = 6;
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

    // Meme fusion que Programme par ligne : 2 lignes qui partagent
    // exactement (code, zone, chaine, article_id) sont un vrai doublon
    // physique (le meme lot decoupe 2 fois) plutot que 2 lignes reelles.
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
        qt_carton: (existing.qt_carton ?? 0) + (row.qt_carton ?? 0),
        qt_vrac: (existing.qt_vrac ?? 0) + (row.qt_vrac ?? 0),
      };
    }

    if (affectedZoneChaine.length > 0) {
      const { error: clearZonesError } = await supabaseServer.rpc("programme_dispatcher_clear_zones", {
        p_pairs: affectedZoneChaine,
      });
      if (clearZonesError) {
        throw new Error(clearZonesError.message);
      }
    }

    const { error: dispatcherError } = await supabaseServer.from("programme_dispatcher_lignes").insert(dispatcherPayload);

    if (!dispatcherError) {
      finalCodeUpdatesByArticleId = codeUpdatesByArticleId;
      dispatcherSucceeded = true;
      break;
    }

    if (dispatcherError.code !== "23505") {
      throw new Error(dispatcherError.message);
    }

    if (attempt === MAX_CODE_ATTEMPTS) {
      throw new Error(
        `Un autre enregistrement a genere le meme code de lot au meme moment. Reessaie. Detail : ${dispatcherError.message}`
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

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
  revalidatePath(`/production/programme/${numeroProgramme}/dispatch`);
  revalidatePath("/ravitailleur-par-ligne");

  // Redirige vers une page dediee qui ne montre QUE les lignes de CE
  // programme (via groupe_id = -numero_programme), jamais melangees a la
  // production reelle des autres chaines/zones - contrairement aux vues
  // Ravitailleur par zone/"Toutes les zones", qui restent des vues globales
  // partagees avec tout le reste de la production.
  redirect(`/production/programme/${numeroProgramme}/dispatch`);
}
