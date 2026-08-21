"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { extractTrailingNumber } from "@/lib/article-code-family";

// Le code genere au Dispatch (Programme par ligne) reste "en attente"
// (pending_article_code_updates) jusqu'a ce que le programme soit confirme
// ICI - "Code par article" ne doit refleter que des codes reellement
// utilises, pas un Dispatch qui pourrait encore etre abandonne/refait.
// Plusieurs groupe_id encore en attente (cas normal du Save "Toutes les
// zones", qui confirme d'un coup tout ce qui trainait) peuvent avoir chacun
// leur propre code en attente pour le MEME article (2 dispatchs distincts
// de la meme famille, aucun encore confirme) - garde le plus recent (le
// numero le plus grand) par champ plutot que le dernier lu au hasard.
// Compare aussi contre le code ACTUEL de l'article (pas seulement entre les
// pending) : sans ca, confirmer un vieux Dispatch en attente ecrasait une
// correction manuelle faite entretemps sur "Code par article" avec un
// numero de pending plus ancien/plus petit (bug remonte par l'utilisateur -
// "je change le code mais ca reprend toujours le dernier fait avant").
async function applyPendingArticleCodeUpdates(groupeIds: number[]): Promise<void> {
  if (groupeIds.length === 0) return;

  const { data: pendingRows, error: fetchError } = await supabaseServer
    .from("pending_article_code_updates")
    .select("article_id, code_manu, code_auto")
    .in("groupe_id", groupeIds);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows =
    (pendingRows as { article_id: number; code_manu: string | null; code_auto: string | null }[] | null) ?? [];

  if (rows.length > 0) {
    const articleIds = [...new Set(rows.map((row) => row.article_id))];

    const { data: currentArticleRows, error: currentFetchError } = await supabaseServer
      .from("articles")
      .select("id, code_manu, code_auto")
      .in("id", articleIds);

    if (currentFetchError) {
      throw new Error(currentFetchError.message);
    }

    const bestByArticleId = new Map<number, { code_manu: string | null; code_auto: string | null }>();

    for (const row of (currentArticleRows as { id: number; code_manu: string | null; code_auto: string | null }[] | null) ?? []) {
      bestByArticleId.set(row.id, { code_manu: row.code_manu, code_auto: row.code_auto });
    }

    for (const row of rows) {
      const current = bestByArticleId.get(row.article_id) ?? { code_manu: null, code_auto: null };

      const currentManuNum = current.code_manu ? extractTrailingNumber(current.code_manu) : null;
      const rowManuNum = row.code_manu ? extractTrailingNumber(row.code_manu) : null;
      if (rowManuNum !== null && (currentManuNum === null || rowManuNum > currentManuNum)) {
        current.code_manu = row.code_manu;
      }

      const currentAutoNum = current.code_auto ? extractTrailingNumber(current.code_auto) : null;
      const rowAutoNum = row.code_auto ? extractTrailingNumber(row.code_auto) : null;
      if (rowAutoNum !== null && (currentAutoNum === null || rowAutoNum > currentAutoNum)) {
        current.code_auto = row.code_auto;
      }

      bestByArticleId.set(row.article_id, current);
    }

    const { error: applyError } = await supabaseServer.rpc("articles_bulk_update_codes", {
      p_updates: [...bestByArticleId.entries()].map(([articleId, update]) => ({
        id: articleId,
        code_manu: update.code_manu,
        code_auto: update.code_auto,
      })),
    });

    if (applyError) {
      throw new Error(applyError.message);
    }
  }

  const { error: deleteError } = await supabaseServer
    .from("pending_article_code_updates")
    .delete()
    .in("groupe_id", groupeIds);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

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
  // l'historique (qui a son propre groupe_id, attribue plus bas).
  const sourceGroupeIds = [
    ...new Set(rows.map((row) => row.groupe_id).filter((id): id is number => id !== null)),
  ];
  const historyRows = rows.map(({ groupe_id, ...rest }) => ({ ...rest, source_groupe_id: groupe_id }));

  // Le code PD1/PD2/PD3... est recalcule a la lecture selon le rang du
  // groupe (meme principe que PL et TE/TS) - on compte les groupe_id
  // distincts existants pour le message de confirmation.
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

    await applyPendingArticleCodeUpdates(sourceGroupeIds);
  }

  revalidatePath(`/ravitailleur-par-ligne/${zone}`);
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  revalidatePath("/articles/produit-fini");

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

  if (sourceGroupeIds.length > 0) {
    const { error: confirmError } = await supabaseServer
      .from("programme_lignes")
      .update({ confirme_production: true })
      .in("groupe_id", sourceGroupeIds);

    if (confirmError) {
      throw new Error(confirmError.message);
    }

    await applyPendingArticleCodeUpdates(sourceGroupeIds);
  }

  revalidatePath("/ravitailleur-par-ligne/tout");
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  revalidatePath("/articles/produit-fini");

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
    .select("id, zone, chaine, article_id, groupe_id")
    .eq("id", id)
    .maybeSingle();

  if (rowError || !rowData) {
    throw new Error("Ligne introuvable.");
  }

  const row = rowData as {
    id: number;
    zone: string;
    chaine: string;
    article_id: number | null;
    groupe_id: number | null;
  };

  let qtCarton: number | null = null;
  if (row.article_id && qtVrac && qtVrac > 0) {
    const { data: articleData } = await supabaseServer
      .from("articles")
      .select("contenance, piece_par_carton")
      .eq("id", row.article_id)
      .maybeSingle();

    const article = articleData as { contenance: number | null; piece_par_carton: number | null } | null;

    if (article?.contenance && article.piece_par_carton) {
      // Toujours arrondi au carton SUPERIEUR (jamais de virgule) - un carton
      // entame compte comme un carton entier, jamais commander moins que
      // necessaire pour le conditionnement.
      qtCarton = Math.ceil(qtVrac / article.contenance / article.piece_par_carton);
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
  if (row.article_id && row.groupe_id) {
    const [{ data: sourceLignes }, { data: dispatcherSiblings }] = await Promise.all([
      supabaseServer
        .from("programme_lignes")
        .select("id, plateforme")
        .eq("groupe_id", row.groupe_id)
        .eq("article_id", row.article_id)
        .eq("zone", row.zone)
        .eq("chaine", row.chaine),
      supabaseServer
        .from("programme_dispatcher_lignes")
        .select("id")
        .eq("groupe_id", row.groupe_id)
        .eq("article_id", row.article_id)
        .eq("zone", row.zone)
        .eq("chaine", row.chaine),
    ]);

    const lignes = (sourceLignes as { id: number; plateforme: string | null }[] | null) ?? [];
    const plateforme = lignes[0]?.plateforme;

    if (trimmedCode && (plateforme === "M" || plateforme === "A")) {
      const field = plateforme === "M" ? "code_manu" : "code_auto";
      const { error: articleUpdateError } = await supabaseServer
        .from("articles")
        .update({ [field]: trimmedCode })
        .eq("id", row.article_id);

      if (articleUpdateError) {
        throw new Error(articleUpdateError.message);
      }
    }

    // Le Dashboard lit numero_lot/numero_lot_detail sur programme_lignes, pas
    // le code affiche ici (programme_dispatcher_lignes.code) - sans cette
    // synchro, un code ajoute/corrige a la main ici restait invisible du
    // Dashboard meme apres confirmation Ravitailleur. On ne le fait que quand
    // le lien (groupe_id, article_id, zone, chaine) est sans ambiguite (une
    // seule ligne programme_lignes ET une seule ligne dispatcher pour cette
    // chaine precise) - un meme article reparti sur PLUSIEURS CHAINES (ex:
    // DSR Elixir sur CHAINE 5 et CHAINE 6) a une ligne programme_lignes
    // distincte PAR CHAINE, donc le filtre zone+chaine suffit a lever
    // l'ambiguite pour ce cas frequent ; seul un lot repArti en plusieurs
    // codes SUR LA MEME chaine (plusieurs lignes dispatcher pour la meme
    // chaine) reste ignore ici, faute de savoir a quelle portion du
    // decoupage ce code appartient.
    if (lignes.length === 1 && (dispatcherSiblings?.length ?? 0) === 1) {
      const numeroLotDetail = trimmedCode
        ? [{ code: trimmedCode, qt_vrac: qtVrac, qt_carton: qtCarton }]
        : [];
      const { error: syncError } = await supabaseServer
        .from("programme_lignes")
        .update({ numero_lot: trimmedCode || null, numero_lot_detail: numeroLotDetail })
        .eq("id", lignes[0].id);

      if (syncError) {
        throw new Error(syncError.message);
      }
    }
  }

  revalidatePath(`/ravitailleur-par-ligne/${row.zone}`);
  revalidatePath("/ravitailleur-par-ligne/tout");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
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
