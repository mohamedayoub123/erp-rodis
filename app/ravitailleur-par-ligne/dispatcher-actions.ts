"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function saveProgrammeDispatcherSnapshotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const zone = String(formData.get("zone") || "").trim();

  if (!zone) {
    throw new Error("Zone invalide.");
  }

  const { data: currentRows, error: fetchError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac, groupe_id")
    .eq("zone", zone);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (currentRows ?? []).map((row) => ({ ...row, cree_par: currentUser }));

  if (rows.length === 0) {
    throw new Error("Rien a enregistrer pour cette zone.");
  }

  // groupe_id ici identifie le programme SOURCE (programme_lignes), pas le
  // groupe PD - renomme en source_groupe_id avant insertion dans
  // l'historique (qui a son propre groupe_id, attribue plus bas). Garde
  // aussi de cote pour confirmer les lignes source correspondantes (voir
  // plus bas) : source_groupe_id permet a deleteProgrammeDispatcherHistoryGroupAction
  // de retrouver TOUTES les lignes du programme meme celles sans code
  // (article sans code_manu/code_auto configure, donc invisibles au
  // matching par code sur numero_lot).
  const sourceGroupeIds = [
    ...new Set(rows.map((row) => row.groupe_id).filter((id): id is number => id !== null)),
  ];
  const historyRows = rows.map(({ groupe_id, ...rest }) => ({ ...rest, source_groupe_id: groupe_id }));

  // Le code PD1/PD2/PD3... est recalcule a la lecture selon le rang du
  // groupe (meme principe que MB1/MB2 et TE1/TS1) - on compte les
  // groupe_id distincts existants pour le message de confirmation.
  const existingGroupIds = new Set<number>();
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows, error: groupFetchError } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id")
      .range(fromIndex, fromIndex + pageSize - 1);

    if (groupFetchError) {
      throw new Error(groupFetchError.message);
    }

    const chunk = (groupRows as { groupe_id: number }[] | null) ?? [];
    chunk.forEach((row) => {
      if (row.groupe_id !== null) existingGroupIds.add(row.groupe_id);
    });

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const generatedCode = `PD${existingGroupIds.size + 1}`;

  const { data: inserted, error: insertError } = await supabaseServer
    .from("programme_dispatcher_history")
    .insert(historyRows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_dispatcher_history")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  // Ce Save confirme officiellement les programmes source pour le suivi de
  // production - ils deviennent visibles sur le Dashboard/Calendrier
  // seulement a partir de maintenant (voir confirme_production).
  if (sourceGroupeIds.length > 0) {
    const { error: confirmError } = await supabaseServer
      .from("programme_lignes")
      .update({ confirme_production: true })
      .in("groupe_id", sourceGroupeIds);

    if (confirmError) {
      throw new Error(confirmError.message);
    }
  }

  revalidatePath(`/ravitailleur-par-ligne/${zone}`);
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");

  return { ok: true, code: generatedCode, groupe_id: groupeId };
}

// Meme principe que saveProgrammeDispatcherSnapshotAction, mais pour TOUTES
// les zones a la fois (bouton unique de la page "Toutes les zones") - un
// seul code PD couvre alors le programme complet, au lieu d'un code par
// zone si chaque zone etait enregistree separement.
export async function saveAllZonesDispatcherSnapshotAction() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const { data: currentRows, error: fetchError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac, groupe_id");

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (currentRows ?? []).map((row) => ({ ...row, cree_par: currentUser }));

  if (rows.length === 0) {
    throw new Error("Rien a enregistrer.");
  }

  // groupe_id ici identifie le programme SOURCE (programme_lignes), pas le
  // groupe PD - renomme en source_groupe_id avant insertion dans
  // l'historique (qui a son propre groupe_id, attribue plus bas). Garde
  // aussi de cote pour confirmer les lignes source correspondantes (voir
  // plus bas) : source_groupe_id permet a deleteProgrammeDispatcherHistoryGroupAction
  // de retrouver TOUTES les lignes du programme meme celles sans code
  // (article sans code_manu/code_auto configure, donc invisibles au
  // matching par code sur numero_lot).
  const sourceGroupeIds = [
    ...new Set(rows.map((row) => row.groupe_id).filter((id): id is number => id !== null)),
  ];
  const historyRows = rows.map(({ groupe_id, ...rest }) => ({ ...rest, source_groupe_id: groupe_id }));

  const existingGroupIds = new Set<number>();
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows, error: groupFetchError } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id")
      .range(fromIndex, fromIndex + pageSize - 1);

    if (groupFetchError) {
      throw new Error(groupFetchError.message);
    }

    const chunk = (groupRows as { groupe_id: number }[] | null) ?? [];
    chunk.forEach((row) => {
      if (row.groupe_id !== null) existingGroupIds.add(row.groupe_id);
    });

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const generatedCode = `PD${existingGroupIds.size + 1}`;

  const { data: inserted, error: insertError } = await supabaseServer
    .from("programme_dispatcher_history")
    .insert(historyRows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_dispatcher_history")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  // Ce Save confirme officiellement les programmes source pour le suivi de
  // production - ils deviennent visibles sur le Dashboard/Calendrier
  // seulement a partir de maintenant (voir confirme_production).
  if (sourceGroupeIds.length > 0) {
    const { error: confirmError } = await supabaseServer
      .from("programme_lignes")
      .update({ confirme_production: true })
      .in("groupe_id", sourceGroupeIds);

    if (confirmError) {
      throw new Error(confirmError.message);
    }
  }

  revalidatePath("/ravitailleur-par-ligne/tout");
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");

  return { ok: true, code: generatedCode, groupe_id: groupeId };
}

// Modification manuelle d'une ligne Dispatcher (code + qt vrac) avant le
// grand "Save" de zone - appelee directement depuis un composant client
// (pas liee a un <form>), donc en arguments simples plutot qu'en FormData.
// qt_carton est recalcule a partir du nouveau qt_vrac (contenance/piece par
// carton de l'article), jamais saisi directement.
export async function updateDispatcherLigneAction(id: number, code: string, qtVracRaw: string) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas modifier.");
  }

  if (!id) {
    throw new Error("Ligne invalide.");
  }

  const trimmedCode = code.trim();
  const qtVracClean = qtVracRaw.trim().replace(",", ".");
  const qtVrac = qtVracClean ? Number(qtVracClean) : null;

  if (qtVracClean && Number.isNaN(qtVrac)) {
    throw new Error("Quantite vrac invalide.");
  }

  const { data: rowData, error: rowError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("id, zone, article_id, groupe_id")
    .eq("id", id)
    .maybeSingle();

  if (rowError || !rowData) {
    throw new Error("Ligne introuvable.");
  }

  const row = rowData as { id: number; zone: string; article_id: number | null; groupe_id: number | null };

  let qtCarton: number | null = null;
  if (row.article_id && qtVrac && qtVrac > 0) {
    const { data: articleData } = await supabaseServer
      .from("articles")
      .select("contenance, piece_par_carton")
      .eq("id", row.article_id)
      .maybeSingle();

    const article = articleData as { contenance: number | null; piece_par_carton: number | null } | null;

    if (article?.contenance && article.piece_par_carton) {
      qtCarton = qtVrac / article.contenance / article.piece_par_carton;
    }
  }

  const { error: updateError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .update({ code: trimmedCode || null, qt_vrac: qtVrac, qt_carton: qtCarton })
    .eq("id", id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Propage le code corrige a la main sur l'article correspondant (Code
  // Article) pour que le prochain code auto-genere reparte de cette valeur
  // au lieu de l'ancienne - le Dispatcher ne garde pas la plateforme (M/A)
  // utilisee, elle est retrouvee via le programme source
  // (programme_lignes, meme groupe_id + article_id).
  if (trimmedCode && row.article_id && row.groupe_id) {
    const { data: sourceLigne } = await supabaseServer
      .from("programme_lignes")
      .select("plateforme")
      .eq("groupe_id", row.groupe_id)
      .eq("article_id", row.article_id)
      .limit(1)
      .maybeSingle();

    const plateforme = (sourceLigne as { plateforme: string | null } | null)?.plateforme;

    if (plateforme === "M" || plateforme === "A") {
      const field = plateforme === "M" ? "code_manu" : "code_auto";
      const { error: articleUpdateError } = await supabaseServer
        .from("articles")
        .update({ [field]: trimmedCode })
        .eq("id", row.article_id);

      if (articleUpdateError) {
        throw new Error(articleUpdateError.message);
      }
    }
  }

  revalidatePath(`/ravitailleur-par-ligne/${row.zone}`);
  revalidatePath("/ravitailleur-par-ligne/tout");
  revalidatePath("/articles/produit-fini");
}

export async function deleteAllDispatcherLignesAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const zone = String(formData.get("zone") || "").trim();

  if (!zone) {
    throw new Error("Zone invalide.");
  }

  const { error } = await supabaseServer.from("programme_dispatcher_lignes").delete().eq("zone", zone);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/ravitailleur-par-ligne/${zone}`);
}

export async function deleteProgrammeDispatcherHistoryGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "historiqueProgrammeDispatcher"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Groupe invalide.");
  }

  const { data: codeRows, error: codeFetchError } = await supabaseServer
    .from("programme_dispatcher_history")
    .select("code, source_groupe_id")
    .eq("groupe_id", groupeId);

  if (codeFetchError) {
    throw new Error(codeFetchError.message);
  }

  const historyLignes = (codeRows as { code: string | null; source_groupe_id: number | null }[] | null) ?? [];
  const deletedCodes = new Set(historyLignes.map((row) => row.code).filter((code): code is string => Boolean(code)));
  const sourceGroupeIds = new Set(
    historyLignes.map((row) => row.source_groupe_id).filter((id): id is number => id !== null)
  );

  const { error } = await supabaseServer
    .from("programme_dispatcher_history")
    .delete()
    .eq("groupe_id", groupeId);

  if (error) {
    throw new Error(error.message);
  }

  // Pas de lien direct (FK) entre l'historique PD et les lignes de
  // programme - 2 facons complementaires de retrouver les lignes source a
  // marquer terminees : par code (via numero_lot, ligne par ligne) et par
  // source_groupe_id (le programme entier). Le matching par groupe_id est
  // indispensable pour les lignes dont l'article n'a pas de code_manu/
  // code_auto configure (numero_lot reste NULL, invisibles au matching par
  // code) - sans lui elles resteraient indefiniment visibles sur le
  // Dashboard meme apres suppression de leur PD.
  if (deletedCodes.size > 0 || sourceGroupeIds.size > 0) {
    const matchingIds = new Set<number>();
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: ligneRows, error: ligneFetchError } = await supabaseServer
        .from("programme_lignes")
        .select("id, numero_lot, groupe_id")
        .range(from, from + pageSize - 1);

      if (ligneFetchError) {
        throw new Error(ligneFetchError.message);
      }

      const chunk = (ligneRows as { id: number; numero_lot: string | null; groupe_id: number }[] | null) ?? [];
      for (const row of chunk) {
        if (sourceGroupeIds.has(row.groupe_id)) {
          matchingIds.add(row.id);
          continue;
        }
        const codes = (row.numero_lot || "").split(",").map((code) => code.trim()).filter(Boolean);
        if (codes.some((code) => deletedCodes.has(code))) {
          matchingIds.add(row.id);
        }
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    if (matchingIds.size > 0) {
      const { error: updateError } = await supabaseServer
        .from("programme_lignes")
        .update({ programme_termine: true, programme_termine_date: new Date().toISOString() })
        .in("id", [...matchingIds]);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }

  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  redirect("/historique-programme-dispatcher");
}
