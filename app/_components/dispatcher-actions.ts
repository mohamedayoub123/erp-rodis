"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Modification manuelle d'une ligne Dispatcher (code + qt vrac) - appelee
// directement depuis DispatcherRowEditor (pas liee a un <form>), donc en
// arguments simples plutot qu'en FormData. qt_carton est recalcule a partir
// du nouveau qt_vrac (contenance/piece par carton de l'article), jamais
// saisi directement.
export async function updateDispatcherLigneAction(id: number, code: string, qtVracRaw: string) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programme"))) {
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
  // au lieu de l'ancienne - la plateforme (M/A) utilisee est retrouvee via
  // le programme source (programme_lignes, meme groupe_id + article_id).
  if (row.article_id && row.groupe_id) {
    const [{ data: sourceLignes }, { data: dispatcherSiblings }] = await Promise.all([
      supabaseServer
        .from("programme_lignes")
        .select("id, plateforme")
        .eq("groupe_id", row.groupe_id)
        .eq("article_id", row.article_id),
      supabaseServer
        .from("programme_dispatcher_lignes")
        .select("id")
        .eq("groupe_id", row.groupe_id)
        .eq("article_id", row.article_id),
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
    // Dashboard meme apres confirmation. On ne le fait que quand le lien
    // (groupe_id, article_id) est sans ambiguite (une seule ligne
    // programme_lignes ET une seule ligne dispatcher pour ce couple).
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

  revalidatePath("/production/programme");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
}
