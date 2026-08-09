"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireDepotsWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les depots.");
  }

  return currentUser;
}

export async function createDepotAction(formData: FormData) {
  await requireDepotsWriteAccess();

  const nom = String(formData.get("nom") || "").trim();
  if (!nom) {
    throw new Error("Nom du depot obligatoire.");
  }

  const { error } = await supabaseServer.from("depots").insert({ nom });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
}

export async function deleteDepotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de depot.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  if (!depotId) {
    throw new Error("Depot invalide.");
  }

  // depot_lie_id (l'autre depot d'un transfert) reference aussi depots(id) -
  // le detacher avant de supprimer, sinon la contrainte de cle etrangere
  // bloque la suppression des qu'un AUTRE depot a deja transfere vers/depuis
  // celui-ci.
  const { error: unlinkError } = await supabaseServer
    .from("depot_mouvements")
    .update({ depot_lie_id: null })
    .eq("depot_lie_id", depotId);

  if (unlinkError) {
    throw new Error(unlinkError.message);
  }

  const { error: deleteMouvementsError } = await supabaseServer
    .from("depot_mouvements")
    .delete()
    .eq("depot_id", depotId);

  if (deleteMouvementsError) {
    throw new Error(deleteMouvementsError.message);
  }

  const { error } = await supabaseServer.from("depots").delete().eq("id", depotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
}

function parseArticleType(raw: FormDataEntryValue | null): "MP" | "PF" {
  return raw === "PF" ? "PF" : "MP";
}

export async function addDepotStockAction(formData: FormData) {
  const currentUser = await requireDepotsWriteAccess();

  const depotId = Number(formData.get("depot_id") || "0");
  const articleType = parseArticleType(formData.get("article_type"));
  const articleId = Number(formData.get("article_id") || "0");
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));
  const note = String(formData.get("note") || "").trim() || null;

  if (!depotId) {
    throw new Error("Depot invalide.");
  }
  if (!articleId) {
    throw new Error("Choisis un article dans la liste.");
  }
  if (!quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer.from("depot_mouvements").insert({
    depot_id: depotId,
    article_type: articleType,
    article_id: articleId,
    type: "entree",
    quantite,
    note,
    utilisateur: currentUser,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/depots/${depotId}`);
}

// Deplace du stock d'un depot vers un autre - 2 lignes liees par le meme
// transfert_id (une sortie sur le depot source, une entree sur le depot
// destination), meme principe que les autres transferts a 2 lignes de
// l'appli (voir programme_dispatcher_lignes/history pour l'idee generale de
// tracer un lien groupe entre 2 ecritures). Le stock disponible est
// recalcule ici (jamais fait confiance a l'affichage cote client) avant
// d'autoriser le transfert.
export async function transferDepotStockAction(formData: FormData) {
  const currentUser = await requireDepotsWriteAccess();

  const depotSourceId = Number(formData.get("depot_id") || "0");
  const depotDestinationId = Number(formData.get("depot_destination_id") || "0");
  const articleType = parseArticleType(formData.get("article_type"));
  const articleId = Number(formData.get("article_id") || "0");
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));
  const note = String(formData.get("note") || "").trim() || null;

  if (!depotSourceId) {
    throw new Error("Depot invalide.");
  }
  if (!depotDestinationId) {
    throw new Error("Choisis un depot de destination.");
  }
  if (depotSourceId === depotDestinationId) {
    throw new Error("Le depot de destination doit etre different du depot source.");
  }
  if (!articleId) {
    throw new Error("Choisis un article dans la liste.");
  }
  if (!quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { data: mouvementsData, error: mouvementsError } = await supabaseServer
    .from("depot_mouvements")
    .select("type, quantite")
    .eq("depot_id", depotSourceId)
    .eq("article_type", articleType)
    .eq("article_id", articleId);

  if (mouvementsError) {
    throw new Error(mouvementsError.message);
  }

  const disponible = ((mouvementsData ?? []) as { type: string; quantite: number }[]).reduce(
    (sum, row) => sum + (row.type === "entree" ? row.quantite : -row.quantite),
    0
  );

  if (quantite > disponible + 1e-6) {
    throw new Error(
      `Stock insuffisant dans ce depot pour cet article - disponible : ${disponible.toLocaleString("fr-FR")}.`
    );
  }

  const { data: inserted, error: insertError } = await supabaseServer
    .from("depot_mouvements")
    .insert([
      {
        depot_id: depotSourceId,
        article_type: articleType,
        article_id: articleId,
        type: "sortie",
        quantite,
        depot_lie_id: depotDestinationId,
        note,
        utilisateur: currentUser,
      },
      {
        depot_id: depotDestinationId,
        article_type: articleType,
        article_id: articleId,
        type: "entree",
        quantite,
        depot_lie_id: depotSourceId,
        note,
        utilisateur: currentUser,
      },
    ])
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const transfertId = Math.min(...insertedIds);

  const { error: transfertUpdateError } = await supabaseServer
    .from("depot_mouvements")
    .update({ transfert_id: transfertId })
    .in("id", insertedIds);

  if (transfertUpdateError) {
    throw new Error(transfertUpdateError.message);
  }

  revalidatePath(`/depots/${depotSourceId}`);
  revalidatePath(`/depots/${depotDestinationId}`);
}
