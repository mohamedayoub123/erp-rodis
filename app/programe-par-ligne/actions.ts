"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { ZONE_GROUPS } from "@/lib/zone-chaine-list";
import { type DispatchSourceRow } from "@/lib/dispatcher-shared";
import { assignDispatcherCodesAndInsert } from "../production/programme/dispatch-engine";

// groupe_id d'un NOUVEAU groupe (jamais Math.min(insertedIds), contrairement
// au V1) : le plus grand groupe_id existant + 1, sur TOUTE la table - meme
// convention que syncProgrammeLignesMirror (app/production/programme/
// actions.ts), necessaire parce que les lignes migrees depuis V1 ont garde
// leur id/groupe_id d'origine, et un Math.min(insertedIds) fraichement
// insere pourrait par coincidence tomber sur un groupe_id deja utilise par
// une ligne totalement sans rapport.
async function nextGroupeId(): Promise<number> {
  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("groupe_id")
    .not("groupe_id", "is", null)
    .order("groupe_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxGroupeId = (data as { groupe_id: number } | null)?.groupe_id ?? 0;
  return maxGroupeId + 1;
}

// Enregistre un nouveau groupe programme_lignes (saisie depuis la grille de
// "Programme par ligne"), puis le dispatche via assignDispatcherCodesAndInsert
// si withDispatch. Pour dispatcher un groupe DEJA enregistre plus tard (voir
// Historique programme, bouton "Dispatch"), voir
// dispatchExistingProgrammeLigneGroupAction, qui appelle directement
// assignDispatcherCodesAndInsert sans passer par ici (pas de nouveau groupe
// a creer).
async function performProgrammeLigneSave(
  filledRows: DispatchSourceRow[],
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
  // lecture a partir du rang du groupe PARMI CEUX DE LA MEME ANNEE (voir
  // lib/programme-pl-code.ts, meme principe que TE1/TS1 dans Mouvements,
  // remis a 1 a chaque nouvelle annee de date_jour).
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
    // fois valide via le bouton "Save" de Ravitailleur par ligne.
    confirme_production: false,
  }));

  const [nextNumberResult, insertResult, groupeId] = await Promise.all([
    supabaseServer.rpc("programme_lignes_next_group_number_for_year", { p_year: anneeJour }),
    supabaseServer.from("programme_lignes").insert(payload).select("id"),
    nextGroupeId(),
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

    let rows: DispatchSourceRow[] = [];

    try {
      rows = JSON.parse(rawPayload) as DispatchSourceRow[];
    } catch {
      return { ok: false, message: "Le contenu du programme est invalide." };
    }

    const filledRows = rows.filter((row) => row.article_id);

    if (filledRows.length === 0) {
      return { ok: false, message: "Choisis au moins un produit avant d'enregistrer." };
    }

    // Remplace le contenu courant de chaque (zone, chaine) presente dans ce
    // Save - meme les chaines laissees vides (sans produit) sont effacees du
    // Dispatcher, pas seulement remplacees quand elles ont un produit.
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
// groupe ni dupliquer ses lignes programme_lignes.
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

  const filledRows: DispatchSourceRow[] = remplies.map((ligne) => ({
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
  // remplies dans ce groupe - un Dispatch (immediat ou differe depuis
  // l'Historique) represente toujours l'etat complet de toute la grille,
  // jamais un ajout partiel.
  const affectedZoneChaine = ZONE_GROUPS.flat();

  // Contrairement a performProgrammeLigneSave, aucune suppression en cas
  // d'echec : ces lignes programme_lignes existaient deja avant cet appel.
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
