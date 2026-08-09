"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { assignDispatcherCodesAndInsert } from "@/app/programe-par-ligne/actions";
import { type DispatchSourceRow } from "@/lib/dispatcher-shared";

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

type MirrorLigneInput = {
  programmeId: number;
  zone: string;
  chaine: string;
  articleId: number;
  produit: string;
  typeArticle: string;
  qtCarton: number;
  qtVrac: number;
  plateforme: string;
  dateJour: string;
};

// Programme (MB) ne creait jusqu'ici AUCUNE ligne dans programme_lignes -
// or Dashboard/Calendrier Production (app/production/suivi/data.ts) lisent
// EXCLUSIVEMENT programme_lignes (confirme_production=true,
// programme_termine=false/null), jamais programme_dispatcher_lignes ni
// programmes. Cette fonction cree/met a jour une ligne "miroir" par ligne
// de programme (liee via source_programme_id, stable a travers les
// redispatchs), exactement comme "Programme par ligne" le fait pour
// lui-meme au Save (performProgrammeLigneSave) - avec le meme groupe_id
// (positif) partage entre toutes les lignes miroir d'un meme MB, reutilise
// (jamais recree) d'un dispatch a l'autre.
async function syncProgrammeLignesMirror(
  numeroProgramme: number,
  lignes: MirrorLigneInput[],
  currentUser: string | null
): Promise<{ groupeId: number; mirrorRowIds: number[]; insertedIds: number[] }> {
  const { data: existingData, error: existingError } = await supabaseServer
    .from("programme_lignes")
    .select("id, source_programme_id, groupe_id")
    .eq("source_numero_programme", numeroProgramme);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRows = (existingData ?? []) as {
    id: number;
    source_programme_id: number | null;
    groupe_id: number | null;
  }[];
  const existingByProgrammeId = new Map(
    existingRows.filter((row) => row.source_programme_id !== null).map((row) => [row.source_programme_id as number, row])
  );

  // Ligne retiree du programme depuis le dernier dispatch (article supprime
  // sur la page MB) : sa ligne miroir n'a plus de raison d'exister, mais
  // seulement si elle n'a jamais ete confirmee - une ligne deja validee sur
  // Ravitailleur/page Dispatch reste en place (historique de production
  // reelle, jamais efface silencieusement).
  const currentProgrammeIds = new Set(lignes.map((l) => l.programmeId));
  const orphanIds = existingRows
    .filter((row) => row.source_programme_id !== null && !currentProgrammeIds.has(row.source_programme_id))
    .map((row) => row.id);
  if (orphanIds.length > 0) {
    const { error: deleteOrphansError } = await supabaseServer
      .from("programme_lignes")
      .delete()
      .in("id", orphanIds)
      .eq("confirme_production", false);
    if (deleteOrphansError) {
      throw new Error(deleteOrphansError.message);
    }
  }

  const mirrorRowIds: number[] = new Array(lignes.length).fill(0);
  const toInsert: Record<string, unknown>[] = [];
  const toInsertIndexes: number[] = [];

  lignes.forEach((ligne, index) => {
    const existing = existingByProgrammeId.get(ligne.programmeId);
    if (existing) {
      mirrorRowIds[index] = existing.id;
      return;
    }
    toInsertIndexes.push(index);
    toInsert.push({
      zone: ligne.zone,
      chaine: ligne.chaine,
      article_id: ligne.articleId,
      produit: ligne.produit || null,
      type_article: ligne.typeArticle || null,
      qt_carton: ligne.qtCarton,
      vrac_a_fabriquer: ligne.qtVrac,
      plateforme: ligne.plateforme,
      programe: `MB${numeroProgramme}`,
      date_jour: ligne.dateJour,
      cree_par: currentUser,
      confirme_production: false,
      source_numero_programme: numeroProgramme,
      source_programme_id: ligne.programmeId,
    });
  });

  let insertedIds: number[] = [];
  if (toInsert.length > 0) {
    const { data: insertedData, error: insertError } = await supabaseServer
      .from("programme_lignes")
      .insert(toInsert)
      .select("id");
    if (insertError) {
      throw new Error(insertError.message);
    }
    insertedIds = ((insertedData ?? []) as { id: number }[]).map((row) => row.id);
    toInsertIndexes.forEach((rowIndex, i) => {
      mirrorRowIds[rowIndex] = insertedIds[i];
    });
  }

  // Lignes existantes : recale zone/chaine/article/quantites/plateforme sur
  // l'etat courant du programme (l'utilisateur a pu modifier la ligne MB
  // depuis le dernier dispatch) - une petite requete par ligne (rarement
  // plus de quelques lignes par programme).
  for (let index = 0; index < lignes.length; index++) {
    if (toInsertIndexes.includes(index)) continue;
    const ligne = lignes[index];
    const { error: updateError } = await supabaseServer
      .from("programme_lignes")
      .update({
        zone: ligne.zone,
        chaine: ligne.chaine,
        article_id: ligne.articleId,
        produit: ligne.produit || null,
        type_article: ligne.typeArticle || null,
        qt_carton: ligne.qtCarton,
        vrac_a_fabriquer: ligne.qtVrac,
        plateforme: ligne.plateforme,
        date_jour: ligne.dateJour,
      })
      .eq("id", mirrorRowIds[index]);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  const existingGroupeIds = existingRows.map((row) => row.groupe_id).filter((id): id is number => id !== null);
  const groupeId = existingGroupeIds.length > 0 ? Math.min(...existingGroupeIds) : Math.min(...mirrorRowIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_lignes")
    .update({ groupe_id: groupeId })
    .eq("source_numero_programme", numeroProgramme);
  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  return { groupeId, mirrorRowIds, insertedIds };
}

// Dispatche un programme (MB) vers programme_dispatcher_lignes ET vers des
// lignes miroir dans programme_lignes (voir syncProgrammeLignesMirror),
// exactement comme le bouton "Dispatch" de "Programme par ligne" (meme
// decoupage en lots, meme generation de code, meme ecriture numero_lot) -
// assignDispatcherCodesAndInsert (app/programe-par-ligne/actions.ts) est
// reutilisee telle quelle pour eviter toute divergence entre les 2 pages.
//
// La zone/chaine viennent de la machine Conditionnement de chaque ligne
// (machines.zone / machines.nom - "chaine 1" etc.), pas d'une liste fixe
// comme sur Programme par ligne. Le groupe_id est desormais un vrai
// groupe_id programme_lignes (positif, stable a travers les redispatchs) -
// c'est ce qui permet a "Save" (page Dispatch) de confirmer ces lignes pour
// le Dashboard/Calendrier, exactement comme le Save de Ravitailleur par
// ligne le fait pour Programme par ligne.
export async function dispatchProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("programmes")
    .select("id, article_id, machine_conditionnement_id, qt_carton, qt_vrac, plateforme, date_jour")
    .eq("numero_programme", numeroProgramme);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as {
    id: number;
    article_id: number;
    machine_conditionnement_id: number | null;
    qt_carton: number;
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
  const mirrorInputs: MirrorLigneInput[] = lignes.map((ligne) => {
    const machine = ligne.machine_conditionnement_id ? machineById.get(ligne.machine_conditionnement_id) : null;
    if (!machine || !machine.zone) {
      const nomArticle = articleById.get(ligne.article_id)?.nom_article ?? `#${ligne.article_id}`;
      throw new Error(
        `${nomArticle} : la machine Conditionnement doit avoir une Zone configuree (page Machines) pour pouvoir dispatcher.`
      );
    }
    const article = articleById.get(ligne.article_id);
    return {
      programmeId: ligne.id,
      zone: machine.zone,
      chaine: machine.nom,
      articleId: ligne.article_id,
      produit: article?.nom_article ?? "",
      typeArticle: article?.type_article ?? "",
      qtCarton: ligne.qt_carton,
      qtVrac: ligne.qt_vrac,
      plateforme: ligne.plateforme === "A" ? "A" : "M",
      dateJour: ligne.date_jour,
    };
  });

  const filledRows: DispatchSourceRow[] = mirrorInputs.map((ligne) => ({
    zone: ligne.zone,
    chaine: ligne.chaine,
    article_id: ligne.articleId,
    produit: ligne.produit,
    type_article: ligne.typeArticle,
    qt_carton: null,
    vrac_a_fabriquer: ligne.qtVrac || null,
    plateforme: ligne.plateforme,
    programe: `MB${numeroProgramme}`,
  }));

  const affectedZoneChaine = [
    ...new Map(filledRows.map((row) => [`${row.zone}::${row.chaine}`, { zone: row.zone, chaine: row.chaine }])).values(),
  ];

  const { groupeId, mirrorRowIds, insertedIds } = await syncProgrammeLignesMirror(
    numeroProgramme,
    mirrorInputs,
    currentUser
  );

  try {
    await assignDispatcherCodesAndInsert(filledRows, dateJour, groupeId, affectedZoneChaine, mirrorRowIds);
  } catch (error) {
    // Meme garantie que performProgrammeLigneSave : un Dispatch rate ne
    // laisse jamais une ligne miroir "fantome" (sans numero_lot) - seules
    // les lignes miroir CREEES par CET appel sont retirees, jamais celles
    // qui existaient deja avant (potentiellement deja confirmees).
    if (insertedIds.length > 0) {
      await supabaseServer.from("programme_lignes").delete().in("id", insertedIds);
    }
    throw error;
  }

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
  revalidatePath(`/production/programme/${numeroProgramme}/dispatch`);
  revalidatePath("/ravitailleur-par-ligne");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");

  // Redirige vers une page dediee qui ne montre QUE les lignes de CE
  // programme, jamais melangees a la production reelle des autres
  // chaines/zones - contrairement aux vues Ravitailleur par zone/"Toutes
  // les zones", qui restent des vues globales partagees avec tout le reste
  // de la production.
  redirect(`/production/programme/${numeroProgramme}/dispatch`);
}
